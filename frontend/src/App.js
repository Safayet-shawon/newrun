import "@/App.css";
import React from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import { StoreProvider } from "@/context/StoreContext";
import { RequireAuth } from "@/components/RequireAuth";
import MarketplaceLayout from "@/components/marketplace/MarketplaceLayout";

import Home from "@/pages/Home";
import ProductListing from "@/pages/ProductListing";
import ProductDetail from "@/pages/ProductDetail";
import Shops from "@/pages/Shops";
import Storefront from "@/pages/Storefront";
import Cart from "@/pages/Cart";
import Wishlist from "@/pages/Wishlist";
import Checkout from "@/pages/Checkout";

import Login from "@/pages/auth/Login";
import Signup from "@/pages/auth/Signup";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import SellerLogin from "@/pages/auth/SellerLogin";
import SellerSignup from "@/pages/auth/SellerSignup";
import AuthCallback from "@/pages/auth/AuthCallback";

import AccountLayout from "@/pages/account/AccountLayout";
import AccountOverview from "@/pages/account/AccountOverview";
import AccountOrders from "@/pages/account/AccountOrders";
import AccountAddresses from "@/pages/account/AccountAddresses";
import AccountProfile from "@/pages/account/AccountProfile";
import AccountWallet from "@/pages/account/AccountWallet";
import AccountRecent from "@/pages/account/AccountRecent";
import FollowedShops from "@/pages/account/FollowedShops";
import LastPurchased from "@/pages/account/LastPurchased";
import OrderSuccess from "@/pages/account/OrderSuccess";

import Onboarding from "@/pages/seller/Onboarding";
import SellerLayout from "@/pages/seller/SellerLayout";
import Overview from "@/pages/seller/Overview";
import Products from "@/pages/seller/Products";
import ProductForm from "@/pages/seller/ProductForm";
import Inventory from "@/pages/seller/Inventory";
import StoreBuilder from "@/pages/seller/StoreBuilder";
import Themes from "@/pages/seller/Themes";
import Subscription from "@/pages/seller/Subscription";
import Orders from "@/pages/seller/Orders";
import Customers from "@/pages/seller/Customers";
import ReviewsPage from "@/pages/seller/ReviewsPage";
import Analytics from "@/pages/seller/Analytics";
import Settings from "@/pages/seller/Settings";
import Notifications from "@/pages/seller/Notifications";
import AdminLayout from "@/pages/admin/AdminLayout";
import SellerDashboardThemes from "@/pages/admin/SellerDashboardThemes";
import { AdminOverview, AdminOrders, AdminCustomers, AdminSellers, AdminCatalogue, AdminFinance, AdminSettings, AdminAudit } from "@/pages/admin/AdminSections";

const M = (C) => (
  <MarketplaceLayout>
    <C />
  </MarketplaceLayout>
);

function AppRoutes() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;

  return (
    <Routes>
      {/* Customer marketplace */}
      <Route path="/" element={M(Home)} />
      <Route path="/products" element={M(ProductListing)} />
      <Route path="/category/:slug" element={M(ProductListing)} />
      <Route path="/search" element={M(ProductListing)} />
      <Route path="/deals" element={M(ProductListing)} />
      <Route path="/product/:id" element={M(ProductDetail)} />
      <Route path="/shops" element={M(Shops)} />
      <Route path="/shop/:slug" element={M(Storefront)} />
      <Route path="/cart" element={M(Cart)} />
      <Route path="/wishlist" element={M(Wishlist)} />
      <Route path="/checkout" element={<RequireAuth><MarketplaceLayout><Checkout /></MarketplaceLayout></RequireAuth>} />

      {/* Auth */}
      <Route path="/login" element={<Login />} />
      <Route path="/admin/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/seller/login" element={<SellerLogin />} />
      <Route path="/seller/signup" element={<SellerSignup />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Customer account */}
      <Route path="/account" element={<RequireAuth role="customer"><AccountLayout /></RequireAuth>}>
        <Route index element={<AccountOverview />} />
        <Route path="orders" element={<AccountOrders />} />
        <Route path="order-success" element={<OrderSuccess />} />
        <Route path="followed-shops" element={<FollowedShops />} />
        <Route path="last-purchased" element={<LastPurchased />} />
        <Route path="wallet" element={<AccountWallet />} />
        <Route path="addresses" element={<AccountAddresses />} />
        <Route path="profile" element={<AccountProfile />} />
        <Route path="wishlist" element={<Wishlist embedded />} />
        <Route path="recently-viewed" element={<AccountRecent />} />
      </Route>

      {/* Seller onboarding */}
      <Route path="/seller/onboarding" element={<RequireAuth role="seller"><Onboarding /></RequireAuth>} />

      {/* Seller dashboard */}
      <Route path="/seller/dashboard" element={<RequireAuth role="seller"><SellerLayout /></RequireAuth>}>
        <Route index element={<Overview />} />
        <Route path="orders" element={<Orders />} />
        <Route path="products" element={<Products />} />
        <Route path="products/new" element={<ProductForm />} />
        <Route path="products/:id/edit" element={<ProductForm />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="store" element={<StoreBuilder />} />
        <Route path="themes" element={<Themes />} />
        <Route path="subscription" element={<Subscription />} />
        <Route path="customers" element={<Customers />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<Settings />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>

      {/* Owner admin */}
      <Route path="/admin/dashboard" element={<RequireAuth role="admin"><AdminLayout /></RequireAuth>}>
        <Route index element={<AdminOverview />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="sellers" element={<AdminSellers />} />
        <Route path="catalogue" element={<AdminCatalogue />} />
        <Route path="finance" element={<AdminFinance />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="themes" element={<SellerDashboardThemes />} />
      </Route>

      <Route path="*" element={M(Home)} />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <AuthProvider>
        <StoreProvider>
          <BrowserRouter>
            <AppRoutes />
            <Toaster position="top-center" richColors closeButton />
          </BrowserRouter>
        </StoreProvider>
      </AuthProvider>
    </div>
  );
}
