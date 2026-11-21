import json, datetime
P = {
 "chicken_portions_mixed":[("Chicken Mixed Portions Value Pack",2000,11999),("Chicken Mixed Portions",1000,6499)],
 "chicken_drumsticks":[("Chicken Drumsticks",1000,6999),("Chicken Drumsticks Family Pack",2000,12999)],
 "chicken_breast_fillets":[("Chicken Breast Fillets",500,5999),("Chicken Breast Fillets Bulk",1000,10999)],
 "chicken_livers":[("Chicken Livers",500,3299),("Chicken Livers Small",250,1899)],
 "chicken_feet":[("Chicken Feet",1000,3999)],
 "chicken_mince":[("Chicken Mince",500,4499)],
 "beef_mince":[("Beef Mince",500,5499),("Beef Mince Value Pack",1000,9999)],
 "beef_stewing":[("Beef Stewing Meat",1000,13999),("Beef Stewing Meat Small",500,7499)],
 "boerewors":[("Traditional Boerewors",1000,9999),("Boerewors Small",500,5499)],
 "polony":[("Polony",1000,4999),("Polony Small",500,2799)],
 "viennas":[("Viennas",1000,7499),("Viennas Small",500,3999)],
 "pork_chops":[("Pork Loin Chops",1000,10999),("Pork Chops Small",500,5999)],
 "pork_sausages":[("Pork Sausages",500,5499)],
 "pilchards_tin":[("Pilchards in Tomato Sauce",400,2799),("Pilchards in Tomato Sauce Small",155,1299)],
 "tuna_tin":[("Tuna Chunks in Brine",170,2699)],
 "hake_fillets":[("Hake Fillets Frozen",800,8999),("Hake Fillets Frozen Small",400,4999)],
 "eggs":[("Large Eggs 6",6,2899),("Large Eggs 18",18,7499),("Large Eggs 30",30,11999)],
 "milk":[("Full Cream Milk 1 L",1000,2199),("Full Cream Milk 2 L",2000,3999)],
 "cheddar_cheese":[("Cheddar Cheese",400,6999),("Cheddar Cheese Large",900,13999)],
 "margarine":[("Margarine Tub",500,3499),("Margarine Tub Large",1000,5999)],
 "maize_meal":[("Super Maize Meal 2.5 kg",2500,3999),("Super Maize Meal 5 kg",5000,6999),("Super Maize Meal 10 kg",10000,12999)],
 "rice":[("Long Grain Rice 2 kg",2000,4499),("Long Grain Rice 1 kg",1000,2499)],
 "pasta":[("Spaghetti",500,1999),("Macaroni",500,1999)],
 "samp":[("Samp 1 kg",1000,2499),("Samp 2 kg",2000,4299)],
 "sugar_beans":[("Sugar Beans 500 g",500,2999),("Sugar Beans 1 kg",1000,5499)],
 "red_lentils":[("Red Lentils",500,2999)],
 "soya_mince":[("Soya Mince Mild Curry",200,1599)],
 "cake_flour":[("Cake Flour 2.5 kg",2500,4499),("Cake Flour 1 kg",1000,2299)],
 "brown_onion_soup":[("Brown Onion Soup Powder",50,1299)],
 "tinned_tomatoes":[("Chopped Tomatoes",410,1599)],
 "baked_beans":[("Baked Beans in Tomato Sauce",410,1799)],
 "butter_beans":[("Butter Beans",410,1899)],
 "chakalaka":[("Chakalaka Mild",410,1799)],
 "tomato_paste":[("Tomato Paste",115,1199),("Tomato Paste Sachet",50,699)],
 "mixed_veg_frozen":[("Mixed Vegetables Frozen",1000,4499)],
 "peas_frozen":[("Garden Peas Frozen",1000,3999)],
 "onion":[("Onions 1 kg",1000,2499),("Onions 2 kg",2000,3999),("Onions Pocket 7 kg",7000,10999)],
 "tomato":[("Tomatoes 1 kg",1000,3299)],
 "potatoes":[("Potatoes 2 kg",2000,4999),("Potatoes Pocket 7 kg",7000,9999)],
 "carrots":[("Carrots 1 kg",1000,2299)],
 "cabbage":[("Cabbage each (approx 1.5 kg)",1500,2499)],
 "spinach":[("Spinach bunch (approx 300 g)",300,2199)],
 "butternut":[("Butternut 1 kg",1000,2499)],
 "green_pepper":[("Green Peppers 3 pack (approx 450 g)",450,2299)],
 "garlic":[("Garlic 4 pack (approx 200 g)",200,2299)],
 "bread":[("White Bread 700 g",700,1899),("Brown Bread 700 g",700,1699)],
 "mayonnaise":[("Mayonnaise 750 g",750,4999),("Mayonnaise 375 g",375,2999)],
 "cooking_oil":[("Sunflower Oil 750 ml",750,3299),("Sunflower Oil 2 L",2000,7499)],
 "salt":[("Table Salt 1 kg",1000,1299)],
 "black_pepper":[("Black Pepper Ground",100,2999)],
 "curry_powder":[("Curry Powder Mild",100,2499)],
 "turmeric":[("Turmeric",50,1999)],
 "paprika":[("Paprika",50,1999)],
 "mixed_herbs":[("Mixed Herbs",20,1999)],
 "braai_spice":[("Braai Spice",200,3499)],
 "peri_peri_spice":[("Peri-Peri Spice",100,2999)],
 "stock_cubes":[("Chicken Stock Cubes 12 pack",120,2499)],
 "sugar":[("White Sugar 2.5 kg",2500,5499)],
 "baking_powder":[("Baking Powder",100,1999)],
 "beef_tripe":[("Beef Tripe (Mogodu) Cleaned",1000,5999)],
 "chicken_gizzards":[("Chicken Gizzards",1000,4999),("Chicken Gizzards Small",500,2799)],
 "chicken_wings":[("Chicken Wings",1000,7999)],
 "russians":[("Russian Sausages",1000,7999),("Russian Sausages Small",500,4299)],
 "corned_beef_tin":[("Corned Meat",300,3499)],
 "fish_fingers":[("Fish Fingers",400,4499)],
 "sweetcorn_tin":[("Cream Style Sweetcorn",410,1899)],
 "pumpkin":[("Pumpkin 1 kg",1000,1999)],
 "green_beans":[("Green Beans 400 g",400,2499)],
 "mushrooms":[("Button Mushrooms 250 g",250,2799)],
 "sweet_potatoes":[("Sweet Potatoes 1 kg",1000,2499)],
 "peanut_butter":[("Smooth Peanut Butter 400 g",400,3999)],
}
ing={i['id']:i for i in json.load(open('seed/ingredients.sample.json'))}
assert set(P)==set(ing), set(ing)^set(P)
MULT={"shoprite":94,"checkers":100,"pnp":104,"spar":109,"usave":90}
# Usave stocks only a small range in the fixture, so plans there show "can't price yet" items (PLN-10 e2e).
USAVE_RANGE={"maize_meal","rice","onion","potatoes","tinned_tomatoes","eggs","sugar_beans","cabbage","pilchards_tin","baked_beans","cooking_oil","salt","curry_powder","stock_cubes"}
SPECIAL={("checkers","Chicken Mixed Portions Value Pack"):9999,("checkers","Beef Mince Value Pack"):8999,("checkers","Long Grain Rice 2 kg"):3999,
 ("checkers","Potatoes Pocket 7 kg"):7999,("checkers","Chopped Tomatoes"):1299,("checkers","Pilchards in Tomato Sauce"):2399,
 ("shoprite","Chicken Mixed Portions Value Pack"):9499,("shoprite","Super Maize Meal 10 kg"):10999,("shoprite","Large Eggs 30"):9999,
 ("shoprite","Cabbage each (approx 1.5 kg)"):1999,("shoprite","Baked Beans in Tomato Sauce"):1499,
 ("pnp","Beef Mince"):4499,("pnp","Spaghetti"):1499,("pnp","Onions 2 kg"):2999,("pnp","Chicken Drumsticks Family Pack"):10999,
 ("spar","Polony"):3999,("spar","White Bread 700 g"):1599,("spar","Traditional Boerewors"):8499}
MEMBER={("checkers","Chicken Mince"):3999,("checkers","Cheddar Cheese"):5999,("checkers","Sunflower Oil 2 L"):6499,("checkers","Sugar Beans 500 g"):2499,
 ("shoprite","Long Grain Rice 2 kg"):3999,("shoprite","Full Cream Milk 2 L"):3499,
 ("pnp","Super Maize Meal 5 kg"):6299,("pnp","Viennas"):6499,("spar","Large Eggs 18"):6999}
MISSING={("spar","soya_mince"),("spar","chakalaka")}  # never stocked in fixture → unpriced at SPAR
EXCLUDED={("spar","chicken_feet")}                  # only a >21-day-old row → excluded
STALE={("spar","butternut")}                        # 10 days old → stale flag
base=datetime.date(2026,11,20)
def price(c,m):
    v=c*m//100; v=(v+50)//100*100-1
    return max(v,99)
rows=[]
for r,m in MULT.items():
    for iid,packs in P.items():
        if (r,iid) in MISSING: continue
        if r=='usave' and iid not in USAVE_RANGE: continue
        for name,qty,c in packs:
            p=price(c,m); obs=base
            if (r,iid) in STALE: obs=base-datetime.timedelta(days=10)
            if (r,iid) in EXCLUDED: obs=base-datetime.timedelta(days=25)
            sp=SPECIAL.get((r,name)); mp=MEMBER.get((r,name))
            if sp is not None: assert sp<p,(r,name,sp,p)
            if mp is not None: assert mp<p,(r,name,mp,p)
            ends=(base+datetime.timedelta(days=5)).isoformat() if sp else ''
            rows.append([r,'',name,'FIXTURE',str(qty),ing[iid]['unit'],iid,str(p),str(mp or ''),str(sp or ''),ends,obs.isoformat()])
with open('seed/prices.fixture.csv','w') as f:
    f.write("# FICTIONAL PRICES for local development and automated tests only. These are NOT real retailer prices and must never be shown to users as real.\n")
    f.write("# Dates are rebased on load so the newest row is 'yesterday' (scripts/seed-lib.ts).\n")
    f.write("retailer_id,branch_id,product_name,brand,pack_qty,pack_unit,ingredient_id,price_cents,member_price_cents,special_price_cents,special_ends_on,observed_at\n")
    for row in rows: f.write(','.join(row)+'\n')
print(len(rows),'rows')
