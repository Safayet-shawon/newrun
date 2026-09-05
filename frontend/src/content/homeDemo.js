// Removable, frontend-only preview. Never inserted into MongoDB or StoreContext.
// Set REACT_APP_HOME_DEMO=false to disable. Successful API responses always win,
// including genuinely empty catalogues. Demo is only used after a request fails.
export const demoEnabled = process.env.REACT_APP_HOME_DEMO !== "false";
const definitions = [
  ["Everyday Backpack", "fashion", "Everyday Studio", 2450, [285,811,160,115]],
  ["Cotton Panjabi", "fashion", "Thread & Story", 1190, [463,811,177,115]],
  ["Wooden Learning Toys", "kids", "Little Discoveries", 1490, [658,811,177,115]],
  ["Skincare Essentials", "beauty", "Daily Ritual", 2290, [851,811,178,115]],
  ["Wireless Earbuds", "electronics", "Everyday Studio", 1790, [1046,811,178,115]],
  ["Minimal Table Lamp", "furniture", "Quiet Home", 1990, [1244,811,178,115]],
];
export const demoProducts = definitions.map(([title, category, shop_name, price, crop], i) => ({ id: `demo-${i}`, demo: true, title, category, shop_name, price, crop: [crop[0], crop[1] + 22, crop[2], crop[3] - 22], stock: 10, review_count: 0, description: "An illustrative listing for exploring the marketplace design. This sample is not available to purchase." }));
export const demoShops = [
  ["Thread & Story", "Clothes with a little character.", "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=240&auto=format&fit=crop"],
  ["Quiet Home", "Make room for the everyday.", "https://images.unsplash.com/photo-1616137422495-1e9e46e2aa77?w=240&auto=format&fit=crop"],
  ["Little Discoveries", "A world of play and imagination.", "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=240&auto=format&fit=crop"],
  ["Daily Ritual", "Simple self-care discoveries.", "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=240&auto=format&fit=crop"],
  ["Everyday Studio", "Useful things, thoughtfully chosen.", "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=240&auto=format&fit=crop"],
].map(([name, description, logo], i) => ({ id: `demo-shop-${i}`, slug: `demo-shop-${i}`, demo: true, name, description, logo, city: "Illustrative shop" }));
export const demoFeed = { trending: demoProducts, featured_shops: demoShops, categories: [{slug:"fashion",name:"Fashion"},{slug:"kids",name:"Kids"},{slug:"beauty",name:"Beauty"},{slug:"electronics",name:"Electronics"},{slug:"furniture",name:"Home"}] };
// Reference-only brand discovery. This is not a partner or stockist list.
export const demoBrands = ["UNIQLO", "MANGO", "Nike", "adidas", "The Ordinary", "IKEA", "Samsung", "Puma", "ZARA", "Levi's"];
const extraSamples = [
  ["Everyday Cotton T-Shirt", "fashion", "Thread & Story", 890, "UNIQLO", "https://images.unsplash.com/photo-1618354691229-88d47f285158?auto=format&fit=crop&w=500"],
  ["Over-Ear Headphones", "electronics", "Everyday Studio", 3200, "Samsung", "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=500"],
  ["Reading Corner Books", "books", "Little Discoveries", 750, "", "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=500"],
  ["Everyday Running Shoes", "sports", "Everyday Studio", 2850, "Nike", "https://images.unsplash.com/photo-1605408499391-6368c628ef42?auto=format&fit=crop&w=500"],
  ["Makeup Brush Collection", "beauty", "Daily Ritual", 980, "The Ordinary", "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=500"],
  ["Living Room Inspiration", "furniture", "Quiet Home", 8500, "IKEA", "https://images.unsplash.com/photo-1616137422495-1e9e46e2aa77?auto=format&fit=crop&w=500"],
];
extraSamples.forEach(([title,category,shop_name,price,brand,photo],i)=>demoProducts.push({id:`demo-extra-${i}`,demo:true,title,category,shop_name,price,brand,images:[photo],stock:10,review_count:0,description:"An illustrative product and price for testing brand and category browsing. Not a genuine branded offer or an item available for purchase."}));
demoProducts.forEach((p,i)=>{p.previewOrder=i;p.brand=p.brand ?? ["MANGO","UNIQLO","","The Ordinary","Samsung","IKEA"][i%6];});
demoFeed.categories.push({slug:"sports",name:"Sports"},{slug:"books",name:"Books"});
demoFeed.brands = demoBrands;
demoProducts.find(p=>p.id==='demo-0').search_terms=['men','women','bag'];
demoProducts.find(p=>p.id==='demo-1').search_terms=['men','panjabi'];
demoProducts.find(p=>p.id==='demo-extra-0').search_terms=['men','shirt'];
demoProducts.push({id:'demo-women-outfit',demo:true,title:"Women's Everyday Outfit",category:'fashion',shop_name:'Thread & Story',price:1890,brand:'MANGO',crop:[530,435,130,154],stock:10,review_count:0,previewOrder:12,search_terms:['women','dress','outfit'],description:'An illustrative fashion look for exploring the design. This is not a genuine branded offer and cannot be purchased.'});
