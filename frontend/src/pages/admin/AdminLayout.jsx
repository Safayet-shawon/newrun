import React from"react";
import{NavLink,Outlet,Link,useNavigate}from"react-router-dom";
import{LayoutDashboard,ShoppingCart,Users,Store,PackageSearch,BadgeDollarSign,Settings,ScrollText,Palette,LogOut,ShieldCheck}from"lucide-react";
import{useAuth}from"@/context/AuthContext";
const NAV=[
 ["/admin/dashboard",LayoutDashboard,"Overview",true],
 ["/admin/dashboard/orders",ShoppingCart,"Orders"],
 ["/admin/dashboard/customers",Users,"Customers"],
 ["/admin/dashboard/sellers",Store,"Sellers & shops"],
 ["/admin/dashboard/catalogue",PackageSearch,"Catalogue"],
 ["/admin/dashboard/finance",BadgeDollarSign,"Finance & payouts"],
 ["/admin/dashboard/settings",Settings,"Plans & delivery"],
 ["/admin/dashboard/audit",ScrollText,"Audit log"],
 ["/admin/dashboard/themes",Palette,"Seller themes"],
];
export default function AdminLayout(){const{user,logout}=useAuth();const navigate=useNavigate();return <div className="min-h-screen bg-[#f7f5fa]"><header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-white px-4 sm:px-6"><Link to="/admin/dashboard" className="font-display text-xl font-bold tracking-widest">NEXORA</Link><span className="inline-flex items-center gap-1 rounded-full bg-nexora-mintbg px-3 py-1 text-xs font-bold text-nexora-emeraldDark"><ShieldCheck size={14}/>OWNER ADMIN</span><div className="ml-auto hidden text-right sm:block"><p className="text-sm font-semibold">{user?.name}</p><p className="text-xs text-nexora-muted">{user?.email}</p></div><button onClick={()=>{logout();navigate("/admin/login")}} className="nx-btn-ghost"><LogOut size={15}/><span className="hidden sm:inline">Sign out</span></button></header><div className="md:grid md:min-h-[calc(100vh-64px)] md:grid-cols-[240px_minmax(0,1fr)]"><aside className="border-b bg-white p-3 md:border-b-0 md:border-r md:p-4"><p className="hidden px-3 pb-3 text-xs font-semibold uppercase tracking-widest text-nexora-muted md:block">Platform control</p><nav className="flex gap-1 overflow-x-auto md:block md:space-y-1">{NAV.map(([to,Icon,label,end])=><NavLink key={to} to={to} end={end} className={({isActive})=>`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${isActive?"bg-nexora-emerald text-white":"text-nexora-muted hover:bg-nexora-mintbg"}`}><Icon size={17}/>{label}</NavLink>)}</nav></aside><main className="min-w-0 p-4 sm:p-6 xl:p-8"><Outlet/></main></div></div>}
