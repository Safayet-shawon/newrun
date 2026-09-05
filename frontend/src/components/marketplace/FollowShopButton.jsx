import React, { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function FollowShopButton({ shopId, initial, className = "nx-btn-ghost" }) {
  const { user } = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const [following,setFollowing] = useState(Boolean(initial)); const [busy,setBusy] = useState(false);
  useEffect(()=>{let active=true;if(!shopId)return undefined;api.get(`/shops/${shopId}/follow`).then(({data})=>{if(active)setFollowing(data.following);}).catch(()=>{});return()=>{active=false;};},[shopId,user?.id]);
  const toggle=async event=>{event.preventDefault();event.stopPropagation();if(!user){navigate("/login",{state:{from:location.pathname+location.search}});return;}setBusy(true);try{const{data}=following?await api.delete(`/shops/${shopId}/follow`):await api.post(`/shops/${shopId}/follow`);setFollowing(data.following);toast.success(data.following?"Shop followed":"Shop unfollowed");}catch(e){toast.error(formatApiError(e));}finally{setBusy(false);}};
  return <button type="button" onClick={toggle} disabled={busy} aria-pressed={following} className={className} data-testid={`follow-shop-${shopId}`}><Heart size={15} className={following?"fill-current":""}/>{busy?"Saving…":following?"Following":"Follow"}</button>;
}
