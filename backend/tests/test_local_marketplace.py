"""Real local MongoDB/API regression tests; never run against a remote database."""
import uuid
import json
from datetime import date,timedelta
from pathlib import Path
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient
ROOT=Path(__file__).resolve().parents[2]
config=dotenv_values(ROOT/'backend/.env')
assert config.get('DB_NAME')=='nexora_local' and '127.0.0.1:27018' in config.get('MONGO_URL',''), 'Local test database required'
database=MongoClient(config['MONGO_URL'])[config['DB_NAME']]
API='http://127.0.0.1:8000/api'

@pytest.fixture(scope='module')
def context():
    suffix=uuid.uuid4().hex[:10]
    def register(role):
        r=requests.post(API+'/auth/register',json={'name':'Integration '+role,'email':f'{role}-{suffix}-{uuid.uuid4().hex[:5]}@example.com','password':uuid.uuid4().hex,'role':role})
        assert r.status_code==200,r.text
        data=r.json()
        return data['user'],{'Authorization':'Bearer '+data['token']}
    customer,ch=register('customer')
    seller,sh=register('seller')
    other,oh=register('seller')
    r=requests.post(API+'/seller/onboarding',headers=sh,json={'business_name':'Regression Shop','phone':'01700000000','category':'fashion','plan':'start','shop_name':'Regression Shop','shop_slug':'test-'+suffix,'courier_provider':'steadfast','pickup_contact_name':'Regression Seller','pickup_phone':'01700000000','pickup_address':'House 1, Road 2','pickup_area':'Dhanmondi','pickup_city':'Dhaka'})
    assert r.status_code==200,r.text
    requests.post(API+'/seller/shop/publish',headers=sh).raise_for_status()
    payload={'title':'Regression Shirt '+suffix,'category':'fashion','price':100,'stock':3,'status':'published','product_type':'apparel','variants':[{'name':'Size','options':['M','L']}],'variant_inventory':[{'options':{'Size':'M'},'price':120,'stock':2},{'options':{'Size':'L'},'stock':1}]}
    r=requests.post(API+'/seller/products',headers=sh,json=payload)
    assert r.status_code==200,r.text
    product=r.json()
    address=requests.post(API+'/account/addresses',headers=ch,json={'label':'Test','full_name':'Test Customer','phone':'01000000000','address':'Local test address','city':'Dhaka'}).json()
    yield {'ch':ch,'sh':sh,'oh':oh,'product':product,'address':address,'seller':seller,'customer':customer}
    database.shops.update_many({'seller_id':seller['id']},{'$set':{'status':'draft'}})
    database.products.update_many({'seller_id':seller['id']},{'$set':{'status':'draft'}})

def body(ctx,qty=1):
    return {'items':[{'product_id':ctx['product']['id'],'qty':qty,'options':{'Size':'M'}}],'address_id':ctx['address']['id'],'idempotency_key':str(uuid.uuid4())}

def test_invalid_quantity_and_options(context):
    b=body(context,0)
    assert requests.post(API+'/checkout/quote',headers=context['ch'],json=b).status_code==422
    b=body(context);b['items'][0]['options']={'Size':'XL'}
    assert requests.post(API+'/checkout/quote',headers=context['ch'],json=b).status_code==422
    b=body(context);b['address_id']='someone-elses-address'
    assert requests.post(API+'/checkout/quote',headers=context['ch'],json=b).status_code==422

def test_server_prices_address_and_idempotency(context):
    b=body(context)
    r=requests.post(API+'/checkout/quote',headers=context['ch'],json=b)
    assert r.status_code==200,r.text
    quote=r.json();assert quote['subtotal_paisa']==12000
    b['expected_total_paisa']=quote['total_paisa']
    r=requests.post(API+'/checkout',headers=context['ch'],json=b)
    assert r.status_code==200,r.text
    order=r.json()['orders'][0]
    assert order['delivery_address']['address']=='Local test address'
    assert order['items'][0]['options']=={'Size':'M'}
    assert order['payment_status']=='unpaid' and order['commission_rate'] is None
    again=requests.post(API+'/checkout',headers=context['ch'],json=b)
    assert again.status_code==200 and again.json()['replayed']
    p=database.products.find_one({'id':context['product']['id']})
    assert p['stock']==2 and p['variant_inventory'][0]['stock']==1

def test_oversell_and_stale_total_do_not_mutate(context):
    b=body(context,2)
    assert requests.post(API+'/checkout/quote',headers=context['ch'],json=b).status_code==409
    b=body(context);b['expected_total_paisa']=1
    assert requests.post(API+'/checkout',headers=context['ch'],json=b).status_code==409
    assert database.products.find_one({'id':context['product']['id']})['stock']==2

def test_seller_ownership_and_unpublished_detail(context):
    pid=context['product']['id']
    assert requests.put(API+'/seller/products/'+pid,headers=context['oh'],json={'title':'Stolen','price':1}).status_code==404
    assert requests.post(API+'/seller/products',headers=context['ch'],json={'title':'Bad','price':1}).status_code==403
    requests.put(API+'/seller/products/'+pid,headers=context['sh'],json={'title':'Regression Shirt','price':100,'status':'draft'}).raise_for_status()
    assert requests.get(API+'/products/'+pid).status_code==404

def test_cake_customization(context):
    r=requests.post(API+'/seller/products',headers=context['sh'],json={'title':'Regression Cake','category':'food','product_type':'cake','price':800,'stock':4,'status':'published','fulfillment':{'lead_time_days':2,'max_message_length':20}})
    assert r.status_code==200,r.text
    b=body(context);b['items']=[{'product_id':r.json()['id'],'qty':1,'customization':{'delivery_date':date.today().isoformat()}}]
    assert requests.post(API+'/checkout/quote',headers=context['ch'],json=b).status_code==409
    b['items'][0]['customization']={'delivery_date':(date.today()+timedelta(days=4)).isoformat(),'message':'Happy birthday'}
    r=requests.post(API+'/checkout/quote',headers=context['ch'],json=b)
    assert r.status_code==200,r.text
    b['expected_total_paisa']=r.json()['total_paisa']
    r=requests.post(API+'/checkout',headers=context['ch'],json=b)
    assert r.status_code==200,r.text
    assert r.json()['orders'][0]['items'][0]['customization']['message']=='Happy birthday'

def test_review_validation_and_verified_purchase(context):
    payload={'product_id':context['product']['id'],'rating':5,'comment':'Local regression review'}
    assert requests.post(API+'/reviews',json=payload).status_code==401
    assert requests.post(API+'/reviews',headers=context['ch'],json={**payload,'rating':6}).status_code==422
    assert requests.post(API+'/reviews',headers=context['ch'],json={**payload,'comment':'   '}).status_code==422
    requests.post(API+'/reviews',headers=context['ch'],json=payload).raise_for_status()
    query={'product_id':context['product']['id'],'user_id':context['customer']['id']}
    assert database.reviews.find_one(query)['verified_purchase'] is False
    database.orders.update_one({'customer_id':context['customer']['id'],'items.product_id':context['product']['id']},{'$set':{'status':'delivered'}})
    requests.post(API+'/reviews',headers=context['ch'],json={**payload,'comment':'Updated local regression review'}).raise_for_status()
    assert database.reviews.find_one(query)['verified_purchase'] is True
    assert database.reviews.count_documents(query)==1

def test_shop_follow_isolation_filter_and_purchase_history(context):
    shop=database.shops.find_one({'seller_id':context['seller']['id']})
    product=context['product']
    other_data=requests.post(API+'/auth/register',json={'name':'Other customer','email':uuid.uuid4().hex+'@example.com','password':uuid.uuid4().hex,'role':'customer'}).json()
    other_headers={'Authorization':'Bearer '+other_data['token']}
    assert requests.post(API+f'/shops/{shop["id"]}/follow').status_code==401
    assert requests.get(API+f'/shops/{shop["id"]}/follow').json()['following'] is False
    for _ in range(2):
        result=requests.post(API+f'/shops/{shop["id"]}/follow',headers=context['ch'])
        assert result.status_code==200 and result.json()['following'] is True
    assert database.shop_follows.count_documents({'customer_id':context['customer']['id'],'shop_id':shop['id']})==1
    assert requests.get(API+f'/shops/{shop["id"]}/follow',headers=other_headers).json()['following'] is False
    followed=requests.get(API+'/account/followed-shops',headers=context['ch']).json()
    assert [item['id'] for item in followed]==[shop['id']]
    products=requests.get(API+'/products',headers=context['ch'],params={'following':'true'}).json()['items']
    assert products and all(item['shop_id']==shop['id'] for item in products)
    assert requests.get(API+'/products',params={'following':'true'}).status_code==401
    assert requests.get(API+'/account/last-purchased',headers=other_headers).json()==[]
    history=requests.get(API+'/account/last-purchased',headers=context['ch']).json()
    assert any(item['product_id']==product['id'] for item in history)
    assert requests.delete(API+f'/shops/{shop["id"]}/follow',headers=context['ch']).json()['following'] is False
    assert requests.get(API+'/products',headers=context['ch'],params={'following':'true'}).json()['items']==[]

def test_multi_shop_checkout_returns_each_shop_once_in_stable_order(context):
    suffix=uuid.uuid4().hex[:10]
    first_shop=database.shops.find_one({'seller_id':context['seller']['id']})
    second_shop={'id':'shop_multi_'+suffix,'slug':'multi-'+suffix,'name':'Second Test Shop','seller_id':'seller_multi_'+suffix,'status':'published'}
    database.shops.insert_one(second_shop)
    products=[]
    for index,shop in enumerate((first_shop,second_shop)):
        product={'id':f'prod_multi_{index}_{suffix}','shop_id':shop['id'],'shop_slug':shop['slug'],'shop_name':shop['name'],'seller_id':shop['seller_id'],'title':f'Multi product {index}','price':100+index,'discount_price':None,'stock':3,'sold_count':0,'status':'published','product_type':'general'}
        database.products.insert_one(product);products.append(product)
    body={'items':[{'product_id':products[0]['id'],'qty':1},{'product_id':products[1]['id'],'qty':1},{'product_id':products[0]['id'],'qty':1}],'address_id':context['address']['id'],'idempotency_key':str(uuid.uuid4()),'payment_method':'cash_on_delivery'}
    quote=requests.post(API+'/checkout/quote',headers=context['ch'],json=body).json()
    body['expected_total_paisa']=quote['total_paisa']
    result=requests.post(API+'/checkout',headers=context['ch'],json=body)
    assert result.status_code==200,result.text
    orders=result.json()['orders']
    assert [order['shop_id'] for order in orders]==[first_shop['id'],second_shop['id']]
    assert [order['shop_slug'] for order in orders]==[first_shop['slug'],second_shop['slug']]
    assert len({order['shop_id'] for order in orders})==2
    database.shops.update_one({'id':second_shop['id']},{'$set':{'status':'draft','is_test':True}})
    database.products.update_many({'id':{'$in':[p['id'] for p in products]}},{'$set':{'status':'draft','is_test':True}})

def test_admin_can_edit_three_seller_dashboard_themes(context):
    original=database.seller_dashboard_themes.find_one({'plan_id':'start'})
    result=requests.post(API+'/auth/register',json={'name':'Theme admin test','email':uuid.uuid4().hex+'@example.com','password':uuid.uuid4().hex,'role':'customer'}).json()
    headers={'Authorization':'Bearer '+result['token']}
    assert requests.get(API+'/admin/seller-dashboard-themes',headers=context['ch']).status_code==403
    database.users.update_one({'id':result['user']['id']},{'$set':{'role':'admin','is_test':True}})
    themes=requests.get(API+'/admin/seller-dashboard-themes',headers=headers)
    assert themes.status_code==200,themes.text
    assert [theme['plan_id'] for theme in themes.json()]==['free','start','grow','pro']
    owner_paths=['overview','orders','customers','sellers','products','categories','finance','platform-settings','audit-log']
    for path in owner_paths:
        assert requests.get(API+'/admin/'+path,headers=context['ch']).status_code==403
        response=requests.get(API+'/admin/'+path,headers=headers)
        assert response.status_code==200,(path,response.text)
    overview=requests.get(API+'/admin/overview',headers=headers).json()
    assert {'gross_revenue_bdt','orders','customers','sellers','shops','products'} <= set(overview['metrics'])
    settings=requests.get(API+'/admin/platform-settings',headers=headers).json()
    assert set(settings['plans'])=={'free','start','grow','pro'}
    assert settings['delivery']['credential_configured'] is False
    try:
        updated={k:v for k,v in themes.json()[0].items() if k in {'name','description','primary_color','sidebar_color','sidebar_text_color','accent_color','surface_color','text_color','border_radius','font_family'}}
        updated.update({'name':'Admin Edited Essential','primary_color':'#123456','border_radius':11})
        saved=requests.put(API+'/admin/seller-dashboard-themes/start',headers=headers,json=updated)
        assert saved.status_code==200,saved.text
        assert saved.json()['primary_color']=='#123456' and saved.json()['border_radius']==11
        seller=requests.get(API+'/seller/me',headers=context['sh'])
        assert seller.status_code==200 and seller.json()['dashboard_theme']['name']=='Admin Edited Essential'
        assert database.audit_events.find_one({'actor_id':result['user']['id'],'action':'admin.seller_dashboard_theme.updated'})
    finally:
        if original:
            database.seller_dashboard_themes.replace_one({'plan_id':'start'},original,upsert=True)
        else:
            database.seller_dashboard_themes.delete_one({'plan_id':'start'})
