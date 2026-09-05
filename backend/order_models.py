from typing import Optional, Dict, List, Literal
from pydantic import BaseModel, Field, ConfigDict

class CartItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_id: str = Field(min_length=1, max_length=100)
    qty: int = Field(default=1, ge=1, le=999, strict=True)
    variant: Optional[str] = Field(default=None, max_length=300)
    options: Dict[str, str] = Field(default_factory=dict)
    customization: Dict[str, str] = Field(default_factory=dict)

class CheckoutBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: List[CartItem] = Field(min_length=1, max_length=100)
    address_id: str = Field(min_length=1, max_length=100)
    idempotency_key: str = Field(min_length=16, max_length=100)
    expected_total_paisa: Optional[int] = Field(default=None, ge=0)
    payment_method: Literal["cash_on_delivery", "nexora_wallet"] = "cash_on_delivery"
