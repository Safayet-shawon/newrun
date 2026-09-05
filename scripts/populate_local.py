"""Create routable development records only in the explicitly isolated local database."""
import json, secrets, sys
from pathlib import Path
import requests
from pymongo import MongoClient
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from dotenv import dotenv_values
config=dotenv_values(ROOT/'backend/.env')
if config.get('DB_NAME') != 'nexora_local' or '127.0.0.1:27018' not in config.get('MONGO_URL',''):
    raise RuntimeError('Refusing sample population outside nexora_local on port 27018')
database=MongoClient(config['MONGO_URL'])[config['DB_NAME']]
api='http://127.0.0.1:8000/api'
accounts_path=ROOT/'.local/dev-accounts.json'
accounts=json.loads(accounts_path.read_text()) if accounts_path.exists() else {}

def account(key,role,name):
    info=accounts.setdefault(key,{'email':f'{key}@nexora.example','password':secrets.token_urlsafe(18)})
    result=requests.post(api+'/auth/login',json=info)
    if result.status_code==401:
        result=requests.post(api+'/auth/register',json={**info,'name':name,'role':role})
    result.raise_for_status()
    data=result.json()
    accounts_path.write_text(json.dumps(accounts,indent=2))
    return data['user'],{'Authorization':'Bearer '+data['token']}

shops=[
 ('thread-story','Thread & Story','fashion','apparel','photo-1441984904996-e0b6ba687e04',[
 ('Everyday Cotton Shirt',890,'photo-1618354691229-88d47f285158',['men','shirt']),
 ('Women’s Weekend Outfit',1890,'photo-1483985988355-763728e1935b',['women','dress']),
 ('Lightweight Everyday Layer',1290,'photo-1618354691229-88d47f285158',['men','women'])]),
 ('sweet-atelier','Sweet Atelier','food','cake','photo-1534432182912-63863115e106',[
 ('Celebration Chocolate Cake',1490,'photo-1534432182912-63863115e106',['cake','chocolate']),
 ('Vanilla Birthday Cake',1290,'photo-1547398847-19d7560a6257',['cake','vanilla']),
 ('Celebration Cake for Two',990,'photo-1583338917451-face2751d8d5',['cake'])]),
 ('quiet-home','Quiet Home','furniture','general','photo-1616137422495-1e9e46e2aa77',[
 ('Reading Corner Lamp',1990,'photo-1616137422495-1e9e46e2aa77',['lamp','home']),
 ('Living Room Collection',8500,'photo-1616486338812-3dadae4b4ace',['home']),
 ('Everyday Home Details',750,'photo-1616137422495-1e9e46e2aa77',['home','decor'])]),
 ('everyday-studio','Everyday Studio','electronics','general','photo-1505740420928-5e560c06d30e',[
 ('Over-Ear Headphones',3200,'photo-1505740420928-5e560c06d30e',['headphones']),
 ('Wireless Listening Set',1790,'photo-1505740420928-5e560c06d30e',['earbuds']),
 ('Studio Audio Essentials',2450,'photo-1505740420928-5e560c06d30e',['audio'])]),
]
extras = [
 [('Relaxed Linen Shirt',1190),('Classic Black T-Shirt',690),('Summer Cotton Tunic',1590),('Everyday Overshirt',1790),('Soft Knit Top',1390),('Weekend Cotton Set',2290)],
 [('Dark Chocolate Celebration Cake',1890),('Vanilla Party Cake',1690),('Chocolate Mini Cake',790),('Vanilla Sharing Cake',1190),('Chocolate Birthday Cake',1990),('Vanilla Occasion Cake',2490)],
 [('Accent Reading Lamp',2290),('Soft Neutral Living Set',7490),('Minimal Room Accessories',990),('Cozy Corner Collection',4590),('Warm Living Room Set',8990),('Modern Home Accent Set',1590)],
 [('Travel Audio Headphones',2190),('Everyday Over-Ear Set',1890),('Studio Listening Headphones',3990),('Compact Audio Set',1490),('Home Listening Headphones',2790),('Premium Over-Ear Headphones',5490)],
]
for entry, additions in zip(shops, extras):
    for index,(title,price) in enumerate(additions):
        source=entry[-1][index%3]
        entry[-1].append((title,price,source[2],source[3]))
for slug,name,category,kind,cover,products in shops:
    user,headers=account('local-'+slug,'seller',name+' Seller')
    if not database.shops.find_one({'seller_id':user['id']}):
        r=requests.post(api+'/seller/onboarding',headers=headers,json={'business_name':name,'category':category,'plan':'start','shop_name':name,'shop_slug':slug,'description':'Independent design and everyday finds. Local development storefront.'});r.raise_for_status()
    image=lambda photo:'https://images.unsplash.com/'+photo+'?auto=format&fit=crop&w=700&q=85'
    r=requests.put(api+'/seller/shop',headers=headers,json={'logo':image(cover),'banner':image(cover),'hero_image':image(cover),'about':'A local development storefront for testing real catalogue, shop and checkout routes.'});r.raise_for_status()
    requests.post(api+'/seller/shop/publish',headers=headers).raise_for_status()
    database.shops.update_one({'seller_id':user['id']},{'$set':{'is_featured':True,'is_development':True}})
    for title,price,photo,tags in products:
        existing=database.products.find_one({'seller_id':user['id'],'title':title})
        variants=([{'name':'Size','options':['S','M','L','XL']},{'name':'Color','options':['Black','Natural']}] if kind=='apparel' else [{'name':'Size','options':['6 inch','8 inch']},{'name':'Flavor','options':['Chocolate','Vanilla']}] if kind=='cake' else [])
        r=requests.request('PUT' if existing else 'POST',api+'/seller/products'+('/'+existing['id'] if existing else ''),headers=headers,json={'title':title,'description':'Local development catalogue record. Use this listing to test the storefront and order flow; it is not a commercial offer.','category':category,'product_type':kind,'brand':name,'price':price,'stock':existing.get('stock',25) if existing else 25,'images':[image(photo)],'variants':variants,'status':'published','tags':tags+['local-development'],'is_featured':True,'fulfillment':{'lead_time_days':2,'allow_message':True,'max_message_length':80,'allergens':'Development example: wheat, milk and eggs.' if kind=='cake' else ''}})
        r.raise_for_status()
account('local-customer','customer','Local Test Customer')
admin,_=account('local-owner','customer','Local Owner')
database.users.update_one({'id':admin['id']},{'$set':{'role':'admin','is_development':True}})
print('Local catalogue ready: 4 shops and 36 distinct routable products. Credentials saved privately in .local/dev-accounts.json.')

