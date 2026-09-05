"""Hide only records created by the local regression test fixtures."""
from pathlib import Path
from dotenv import dotenv_values
from pymongo import MongoClient
config=dotenv_values(Path(__file__).resolve().parents[1]/'backend/.env')
assert config.get('DB_NAME')=='nexora_local' and '127.0.0.1:27018' in config.get('MONGO_URL','')
db=MongoClient(config['MONGO_URL'])[config['DB_NAME']]
ids=[s['id'] for s in db.shops.find({'name':'Regression Shop','slug':{'$regex':'^test-[0-9a-f]{10}$'}})]
db.shops.update_many({'id':{'$in':ids}},{'$set':{'status':'draft','is_test':True}})
db.products.update_many({'shop_id':{'$in':ids}},{'$set':{'status':'draft','is_test':True}})
print('Regression catalogue hidden; sample shops and customer data preserved.')
