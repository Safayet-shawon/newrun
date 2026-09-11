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
import VisualSearch from "@/pages/VisualSearch";
import Shops from "@/pages/Shops";
import Storefront from "@/pages/Storefront";
import Cart from "@/pages/Cart";
import Wishlist from "@/pages/Wishlist";
import Checkout from "@/pages/Checkout";
import Legal from "@/pages/Legal";

import Login from "@/pages/auth/Login";
import Signup from "@/pages/auth/Signup";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import VerifyEmail from "@/pages/auth/VerifyEmail";
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
import Intelligence from "@/pages/seller/IntelligenceV2";
import StoreImport from "@/pages/seller/StoreImportV2";
import Settings from "@/pages/seller/Settings";
import Notifications from "@/pages/seller/Notifications";

import AdminLayout from "@/pages/admin/AdminLayout";
import AdminTokens from "@/pages/admin/AdminTokens";
import {
  SellersSubscriptions,
  CategoriesAdmin,
  FeaturedShops,
  RevenueCommission,
  BuyersCustomers,
  PendingConfirmations,
  AddSubscription,
  OwnerSettings,
} from "@/pages/admin/NexoraAdminPages";
import {
  OwnerCommandCenter,
  SiteContentControl,
  PeopleRiskControl,
  ProductModeration,
  SecurityIPControl,
} from "@/pages/admin/AdminControlPages";

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
      <Route path="/" element={M(Home)} />
      <Route path="/products" element={M(ProductListing)} />
      <Route path="/category/:slug" element={M(ProductListing)} />
      <Route path="/search" element={M(ProductListing)} />
      <Route path="/visual-search" element={M(VisualSearch)} />
      <Route path="/deals" element={M(ProductListing)} />
      <Route path="/product/:id" element={M(ProductDetail)} />
      <Route path="/shops" element={M(Shops)} />
      <Route path="/shop/:slug" element={M(Storefront)} />
      <Route path="/cart" element={M(Cart)} />
      <Route path="/wishlist" element={M(Wishlist)} />
      <Route path="/checkout" element={<RequireAuth><MarketplaceLayout><Checkout /></MarketplaceLayout></RequireAuth>} />
      <Route path="/privacy" element={M(() => <Legal type="privacy" />)} />
      <Route path="/terms" element={M(() => <Legal type="terms" />)} />
      <Route path="/returns" element={M(() => <Legal type="returns" />)} />

      <Route path="/login" element={<Login />} />
      <Route path="/admin/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/seller/login" element={<SellerLogin />} />
      <Route path="/seller/signup" element={<SellerSignup />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route path="/account" element={<RequireAuth role="customer"><MarketplaceLayout><AccountLayout /></MarketplaceLayout></RequireAuth>}>
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

      <Route path="/seller/onboarding" element={<RequireAuth role="seller"><Onboarding /></RequireAuth>} />

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
        <Route path="wallet" element={<AccountWallet />} />
        <Route path="customers" element={<Customers />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="intelligence" element={<Intelligence />} />
        <Route path="import-store" element={<StoreImport />} />
        <Route path="settings" element={<Settings />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>

      <Route path="/admin/dashboard" element={<RequireAuth role="admin"><AdminLayout /></RequireAuth>}>
        <Route index element={<OwnerCommandCenter />} />
        <Route path="people" element={<PeopleRiskControl />} />
        <Route path="products" element={<ProductModeration />} />
        <Route path="categories" element={<CategoriesAdmin />} />
        <Route path="content" element={<SiteContentControl />} />
        <Route path="featured" element={<FeaturedShops />} />
        <Route path="security" element={<SecurityIPControl />} />
        <Route path="sellers" element={<SellersSubscriptions />} />
        <Route path="revenue" element={<RevenueCommission />} />
        <Route path="buyers" element={<BuyersCustomers />} />
        <Route path="pending" element={<PendingConfirmations />} />
        <Route path="subscriptions" element={<AddSubscription />} />
        <Route path="tokens" element={<AdminTokens />} />
        <Route path="settings" element={<OwnerSettings />} />
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
