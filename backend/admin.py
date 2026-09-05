from typing import Literal, Optional
from copy import deepcopy
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from db import db, new_id, now_iso
from entitlements import PLAN_FEATURES, PLANS, PLAN_ORDER
from security import require_role

router = APIRouter()
admin_dep = require_role("admin")
PLAN_IDS = tuple(PLAN_ORDER)

DEFAULT_DASHBOARD_THEMES = {
    "start": {"plan_id":"start","name":"Essential","description":"A clean dashboard for new shops.","primary_color":"#6A4FD6","sidebar_color":"#FFFFFF","sidebar_text_color":"#1E1B2E","accent_color":"#A893F0","surface_color":"#FBFBFA","text_color":"#1E1B2E","border_radius":12,"font_family":"sans"},
    "grow": {"plan_id":"grow","name":"Growth","description":"A focused workspace for growing catalogues.","primary_color":"#5139AD","sidebar_color":"#211B36","sidebar_text_color":"#F7F5FA","accent_color":"#C4B5FD","surface_color":"#F7F5FA","text_color":"#1E1B2E","border_radius":14,"font_family":"modern"},
    "pro": {"plan_id":"pro","name":"Professional","description":"A premium workspace for established sellers.","primary_color":"#8B5CF6","sidebar_color":"#181426","sidebar_text_color":"#F8F7FC","accent_color":"#F0ABFC","surface_color":"#F8F7FC","text_color":"#161322","border_radius":16,"font_family":"serif"},
}
DEFAULT_PLATFORM_SETTINGS = {
    "commission_percent": 0,
    "plans": {p: {"name": PLANS[p]["name"], "price_bdt": PLANS[p]["price_bdt"], "billing_enabled": False} for p in PLAN_IDS},
    "delivery": {"provider": "manual", "enabled": False, "api_base_url": "", "credential_reference": ""},
}

async def audit(user, action, resource_id, changes=None):
    await db.audit_events.insert_one({"id":new_id("audit_"),"actor_id":user["id"],"actor_email":user.get("email"),"action":action,"resource_id":resource_id,"changes":changes or {},"created_at":now_iso()})

async def get_dashboard_theme(plan_id: str):
    stored = await db.seller_dashboard_themes.find_one({"plan_id":plan_id},{"_id":0})
    return stored or DEFAULT_DASHBOARD_THEMES.get(plan_id, DEFAULT_DASHBOARD_THEMES["start"])

async def get_platform_settings():
    stored = await db.platform_settings.find_one({"id":"owner"},{"_id":0})
    if not stored: return deepcopy(DEFAULT_PLATFORM_SETTINGS)
    return {**DEFAULT_PLATFORM_SETTINGS,**stored,"plans":{**DEFAULT_PLATFORM_SETTINGS["plans"],**stored.get("plans",{})},"delivery":{**DEFAULT_PLATFORM_SETTINGS["delivery"],**stored.get("delivery",{})}}

class DashboardThemeUpdate(BaseModel):
    model_config=ConfigDict(extra="forbid")
    name:str=Field(min_length=2,max_length=50); description:str=Field(default="",max_length=180)
    primary_color:str=Field(pattern=r"^#[0-9A-Fa-f]{6}$"); sidebar_color:str=Field(pattern=r"^#[0-9A-Fa-f]{6}$"); sidebar_text_color:str=Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    accent_color:str=Field(pattern=r"^#[0-9A-Fa-f]{6}$"); surface_color:str=Field(pattern=r"^#[0-9A-Fa-f]{6}$"); text_color:str=Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    border_radius:int=Field(ge=0,le=24,strict=True); font_family:Literal["sans","modern","serif"]

class StatusUpdate(BaseModel): status:str
class PlanSetting(BaseModel):
    name:str=Field(min_length=2,max_length=30); price_bdt:int=Field(ge=0,le=1_000_000); billing_enabled:bool=False
class DeliverySetting(BaseModel):
    provider:str=Field(min_length=2,max_length=40,pattern=r"^[A-Za-z0-9 _-]+$"); enabled:bool=False
    api_base_url:str=Field(default="",max_length=300); credential_reference:str=Field(default="",max_length=80,pattern=r"^[A-Za-z0-9_]*$")
class PlatformSettingsUpdate(BaseModel):
    model_config=ConfigDict(extra="forbid")
    commission_percent:float=Field(ge=0,le=50); plans:dict[Literal["start","grow","pro"],PlanSetting]; delivery:DeliverySetting

@router.get("/admin/overview")
async def overview(user=Depends(admin_dep)):
    orders=await db.orders.find({}, {"_id":0,"total":1,"total_paisa":1,"status":1,"payment_status":1}).to_list(10000)
    revenue=sum(float(o.get("total",o.get("total_paisa",0)/100)) for o in orders); statuses={}
    for o in orders: statuses[o.get("status","unknown")]=statuses.get(o.get("status","unknown"),0)+1
    return {"metrics":{"gross_revenue_bdt":round(revenue,2),"orders":len(orders),"customers":await db.users.count_documents({"role":"customer"}),"sellers":await db.users.count_documents({"role":"seller"}),"shops":await db.shops.count_documents({}),"products":await db.products.count_documents({})},"order_statuses":statuses,"recent_orders":await db.orders.find({}, {"_id":0}).sort([("created_at",-1)]).limit(8).to_list(8),"recent_sellers":await db.shops.find({}, {"_id":0}).sort([("created_at",-1)]).limit(6).to_list(6)}

@router.get("/admin/orders")
async def admin_orders(status:Optional[str]=None,limit:int=Query(200,ge=1,le=500),user=Depends(admin_dep)):
    return await db.orders.find({"status":status} if status else {},{"_id":0}).sort([("created_at",-1)]).limit(limit).to_list(limit)
@router.get("/admin/orders/{order_id}")
async def admin_order(order_id:str,user=Depends(admin_dep)):
    item=await db.orders.find_one({"id":order_id},{"_id":0})
    if not item: raise HTTPException(404,"Order not found")
    return item
@router.patch("/admin/orders/{order_id}/status")
async def update_order_status(order_id:str,body:StatusUpdate,user=Depends(admin_dep)):
    if body.status not in {"pending","confirmed","processing","shipped","delivered","cancelled"}: raise HTTPException(422,"Unsupported order status")
    result=await db.orders.update_one({"id":order_id},{"$set":{"status":body.status,"updated_at":now_iso()}})
    if not result.matched_count: raise HTTPException(404,"Order not found")
    await audit(user,"admin.order.status_updated",order_id,{"status":body.status}); return await admin_order(order_id,user)

@router.get("/admin/customers")
async def customers(user=Depends(admin_dep)):
    items=await db.users.find({"role":"customer"},{"_id":0,"password_hash":0}).sort([("created_at",-1)]).to_list(1000)
    for item in items:
        orders=await db.orders.find({"customer_id":item["id"]},{"_id":0,"total":1,"total_paisa":1}).to_list(1000)
        item["order_count"]=len(orders); item["total_spent_bdt"]=round(sum(float(o.get("total",o.get("total_paisa",0)/100)) for o in orders),2)
    return items
@router.get("/admin/customers/{customer_id}/orders")
async def customer_orders(customer_id:str,user=Depends(admin_dep)):
    return await db.orders.find({"customer_id":customer_id},{"_id":0}).sort([("created_at",-1)]).to_list(500)

@router.get("/admin/sellers")
async def sellers(user=Depends(admin_dep)):
    items=await db.users.find({"role":"seller"},{"_id":0,"password_hash":0}).sort([("created_at",-1)]).to_list(1000)
    for item in items:
        item["shop"]=await db.shops.find_one({"seller_id":item["id"]},{"_id":0}); item["subscription"]=await db.subscriptions.find_one({"seller_id":item["id"]},{"_id":0})
    return items
@router.patch("/admin/sellers/{seller_id}/status")
async def update_seller_status(seller_id:str,body:StatusUpdate,user=Depends(admin_dep)):
    if body.status not in {"active","suspended"}: raise HTTPException(422,"Seller status must be active or suspended")
    result=await db.users.update_one({"id":seller_id,"role":"seller"},{"$set":{"status":body.status,"updated_at":now_iso()}})
    if not result.matched_count: raise HTTPException(404,"Seller not found")
    await audit(user,"admin.seller.status_updated",seller_id,{"status":body.status}); return {"ok":True,"status":body.status}
@router.patch("/admin/shops/{shop_id}/status")
async def update_shop_status(shop_id:str,body:StatusUpdate,user=Depends(admin_dep)):
    if body.status not in {"draft","published","suspended"}: raise HTTPException(422,"Unsupported shop status")
    result=await db.shops.update_one({"id":shop_id},{"$set":{"status":body.status,"updated_at":now_iso()}})
    if not result.matched_count: raise HTTPException(404,"Shop not found")
    await audit(user,"admin.shop.status_updated",shop_id,{"status":body.status}); return {"ok":True,"status":body.status}

@router.get("/admin/products")
async def products(user=Depends(admin_dep)):
    return await db.products.find({}, {"_id":0}).sort([("created_at",-1)]).limit(1000).to_list(1000)
@router.patch("/admin/products/{product_id}/status")
async def update_product_status(product_id:str,body:StatusUpdate,user=Depends(admin_dep)):
    if body.status not in {"draft","published","archived"}: raise HTTPException(422,"Unsupported product status")
    result=await db.products.update_one({"id":product_id},{"$set":{"status":body.status,"updated_at":now_iso()}})
    if not result.matched_count: raise HTTPException(404,"Product not found")
    await audit(user,"admin.product.status_updated",product_id,{"status":body.status}); return {"ok":True,"status":body.status}
@router.get("/admin/categories")
async def categories(user=Depends(admin_dep)):
    items=await db.categories.find({}, {"_id":0}).sort([("name",1)]).to_list(200)
    for item in items: item["product_count"]=await db.products.count_documents({"category":item["slug"]})
    return items

@router.get("/admin/finance")
async def finance(user=Depends(admin_dep)):
    settings=await get_platform_settings(); orders=await db.orders.find({}, {"_id":0,"total":1,"total_paisa":1,"payment_status":1}).to_list(10000)
    gross=sum(float(o.get("total",o.get("total_paisa",0)/100)) for o in orders); paid=sum(float(o.get("total",o.get("total_paisa",0)/100)) for o in orders if o.get("payment_status")=="paid"); rate=settings["commission_percent"]
    return {"gross_bdt":round(gross,2),"paid_bdt":round(paid,2),"unpaid_bdt":round(gross-paid,2),"commission_percent":rate,"estimated_commission_bdt":round(paid*rate/100,2),"payouts":await db.payouts.find({}, {"_id":0}).sort([("created_at",-1)]).limit(200).to_list(200)}

@router.get("/admin/platform-settings")
async def platform_settings(user=Depends(admin_dep)):
    settings=await get_platform_settings(); settings["plan_features"]=PLAN_FEATURES; settings["delivery"]["credential_configured"]=bool(settings["delivery"].get("credential_reference")); return settings
@router.put("/admin/platform-settings")
async def update_platform_settings(body:PlatformSettingsUpdate,user=Depends(admin_dep)):
    if set(body.plans)!=set(PLAN_IDS): raise HTTPException(422,"START, GROW and PRO plan settings are required")
    data=body.model_dump()
    for plan in data["plans"].values(): plan["billing_enabled"]=False
    data.update({"id":"owner","updated_at":now_iso(),"updated_by":user["id"]})
    await db.platform_settings.update_one({"id":"owner"},{"$set":data,"$setOnInsert":{"created_at":now_iso()}},upsert=True)
    await audit(user,"admin.platform_settings.updated","owner",{"commission_percent":data["commission_percent"],"delivery":{**data["delivery"],"credential_reference":bool(data["delivery"].get("credential_reference"))},"plans":data["plans"]}); return await platform_settings(user)
@router.get("/admin/audit-log")
async def audit_log(limit:int=Query(200,ge=1,le=500),user=Depends(admin_dep)):
    return await db.audit_events.find({}, {"_id":0}).sort([("created_at",-1)]).limit(limit).to_list(limit)

@router.get("/admin/seller-dashboard-themes")
async def list_dashboard_themes(user=Depends(admin_dep)): return [await get_dashboard_theme(p) for p in PLAN_IDS]
@router.put("/admin/seller-dashboard-themes/{plan_id}")
async def update_dashboard_theme(plan_id:str,body:DashboardThemeUpdate,user=Depends(admin_dep)):
    if plan_id not in PLAN_IDS: raise HTTPException(404,"Seller plan theme not found")
    updates={**body.model_dump(),"plan_id":plan_id,"updated_at":now_iso(),"updated_by":user["id"]}
    await db.seller_dashboard_themes.update_one({"plan_id":plan_id},{"$set":updates,"$setOnInsert":{"created_at":now_iso()}},upsert=True)
    await audit(user,"admin.seller_dashboard_theme.updated",plan_id,body.model_dump()); return await get_dashboard_theme(plan_id)
