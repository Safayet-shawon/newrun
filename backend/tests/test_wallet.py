"""Wallet regressions against the isolated local replica set. No gateway charges."""
import asyncio
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[2]
config = dotenv_values(ROOT/'backend/.env')
assert config.get('DB_NAME') == 'nexora_local' and '127.0.0.1:27018' in config.get('MONGO_URL','')
database = MongoClient(config['MONGO_URL'])[config['DB_NAME']]
API = 'http://127.0.0.1:8000/api'

def test_verified_credit_replay_and_forgery(monkeypatch):
    sys.path.insert(0,str(ROOT/'backend'))
    for k in ('MONGO_URL','DB_NAME'):
        monkeypatch.setenv(k,config[k])
    monkeypatch.setenv('SSLCOMMERZ_MODE','sandbox')
    import wallet
    from fastapi import HTTPException
    uid='wallet-test-'+uuid.uuid4().hex
    deposit_id='test-dep-'+uuid.uuid4().hex
    database.wallets.insert_one({'user_id':uid,'mode':'sandbox','balance_paisa':0})
    database.wallet_deposits.insert_one({'id':deposit_id,'user_id':uid,'mode':'sandbox','key':uuid.uuid4().hex,'amount_paisa':10000,'status':'pending'})
    verified={'status':'VALID','tran_id':deposit_id,'currency':'BDT','amount':'100.00','risk_level':'0','val_id':uuid.uuid4().hex}
    async def exercise():
        for change in ({'amount':'101'},{'currency':'USD'},{'tran_id':'forged'},{'status':'FAILED'},{'risk_level':'1'},{'val_id':''}):
            with pytest.raises(HTTPException):
                await wallet.credit_verified_deposit(deposit_id,{**verified,**change})
            assert database.wallets.find_one({'user_id':uid})['balance_paisa']==0
        await wallet.credit_verified_deposit(deposit_id,verified)
        await wallet.credit_verified_deposit(deposit_id,verified)
        assert database.wallets.find_one({'user_id':uid})['balance_paisa']==10000
        assert database.wallet_ledger.count_documents({'reference':deposit_id})==1
        monkeypatch.setenv('SSLCOMMERZ_MODE','live')
        with pytest.raises(HTTPException):
            await wallet.credit_verified_deposit(deposit_id,verified)
        assert database.wallets.find_one({'user_id':uid,'mode':'live'}) is None
    asyncio.run(exercise())

def test_wallet_api_and_atomic_purchase():
    suffix=uuid.uuid4().hex
    data=requests.post(API+'/auth/register',json={'name':'Wallet test','email':suffix+'@example.com','password':uuid.uuid4().hex}).json()
    headers={'Authorization':'Bearer '+data['token']};uid=data['user']['id']
    assert requests.get(API+'/account/wallet').status_code==401
    wallet=requests.get(API+'/account/wallet',headers=headers).json()
    assert wallet['balance_paisa']==0 and wallet['mode']=='sandbox'
    assert requests.post(API+'/account/wallet/deposits',headers=headers,json={'amount_paisa':-1,'phone':'01000000000','idempotency_key':suffix}).status_code==422
    assert requests.post(API+'/payments/sslcommerz/ipn',data={'status':'VALID','tran_id':'forged','amount':'99999'}).status_code in (400,503)
    address=requests.post(API+'/account/addresses',headers=headers,json={'label':'Test','full_name':'Test','phone':'01000000000','address':'Local test','city':'Dhaka'}).json()
    sid='wallet-shop-'+suffix;pid='wallet-prod-'+suffix
    database.shops.insert_one({'id':sid,'slug':sid,'status':'published','seller_id':'wallet-test-seller','name':'Wallet test shop'})
    database.products.insert_one({'id':pid,'shop_id':sid,'title':'Wallet regression product','price':100,'stock':2,'status':'published'})
    body={'items':[{'product_id':pid,'qty':1}],'address_id':address['id'],'payment_method':'nexora_wallet','idempotency_key':suffix,'expected_total_paisa':16000}
    try:
        assert requests.post(API+'/checkout',headers=headers,json=body).status_code==409
        assert database.products.find_one({'id':pid})['stock']==2
        # Test fixture funds exist only in this unique test user's sandbox wallet.
        database.wallets.update_one({'user_id':uid,'mode':'sandbox'},{'$set':{'balance_paisa':20000}})
        database.wallet_ledger.insert_one({'id':uuid.uuid4().hex,'user_id':uid,'mode':'sandbox','reference':'fixture-'+suffix,'type':'test_fixture','amount_paisa':20000})
        result=requests.post(API+'/checkout',headers=headers,json=body)
        assert result.status_code==200,result.text
        order=result.json()['orders'][0]
        assert order['payment_status']=='paid' and order['payment_mode']=='sandbox'
        assert requests.post(API+'/checkout',headers=headers,json=body).json()['replayed']
        assert database.wallets.find_one({'user_id':uid})['balance_paisa']==4000
        assert database.products.find_one({'id':pid})['stock']==1
        assert database.wallet_ledger.count_documents({'reference':order['checkout_id']})==1
        database.wallets.update_one({'user_id':uid,'mode':'sandbox'},{'$inc':{'balance_paisa':16000}})
        database.wallet_ledger.insert_one({'id':uuid.uuid4().hex,'user_id':uid,'mode':'sandbox','reference':'fixture-race-'+suffix,'type':'test_fixture','amount_paisa':16000})
        database.products.update_one({'id':pid},{'$set':{'stock':2}})
        with ThreadPoolExecutor(max_workers=2) as pool:
            pending=[pool.submit(requests.post,API+'/checkout',headers=headers,json={**body,'idempotency_key':uuid.uuid4().hex}) for _ in range(2)]
            assert sorted(f.result().status_code for f in pending)==[200,409]
        assert database.wallets.find_one({'user_id':uid})['balance_paisa']==4000
        assert database.products.find_one({'id':pid})['stock']==1
    finally:
        database.shops.update_one({'id':sid},{'$set':{'status':'draft'}})
        database.products.update_one({'id':pid},{'$set':{'status':'draft'}})
