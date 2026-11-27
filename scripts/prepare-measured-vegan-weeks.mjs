import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {isVeganWeek,VEGAN_PACKAGE_MAX_BYTES} from '../src/lib/contracts/vegan-week.ts';
const metric=JSON.parse(fs.readFileSync(new URL('../docs/plans/vegan-sources/recipes-metric.json',import.meta.url),'utf8')).map(({id,name,group,region,servings,minutes,ingredients,steps})=>({id,name,group,region,servings,minutes,ingredients,steps}));
const g=(name,quantity)=>({name,quantity,unit:'g'});
const ml=(name,quantity)=>({name,quantity,unit:'ml'});
const recipe=(id,name,group,minutes,ingredients,steps)=>({id,name,group,region:'multiple',minutes,servings:1,ingredients,steps});
const beans=['Đậu lăng','Đậu đen','Đậu đỏ','Đậu gà'];
const greens=['Cải kale','Bông cải xanh','Bắp cải'];
const spreads=['Bơ đậu phộng không muối','Tahini không thêm muối'];
const combos=beans.flatMap(bean=>greens.flatMap(veg=>spreads.map(spread=>({bean,veg,spread}))));
for(const [w,week] of ['2026-11-09','2026-11-16','2026-11-23'].entries()){
 const res=await fetch('https://media.quangtu.vn/vegan/weeks/v2/'+week+'.json');
 if(!res.ok) throw Error(res.status);
 const data=await res.json();
 data.metric=true;
 data.recipes=metric;
 data.measured=combos.slice(w*7,w*7+7).map(({bean,veg,spread})=>[
  [
   recipe('measured-oats','Cháo yến mạch chuối, chia và Grape-Nuts','porridge',10,[g('Yến mạch khô',70),ml('Nước lọc',250),g('Chuối đã bóc vỏ',100),g('Hạt chia',10),g('Grape-Nuts Original (nhãn 16,2 mg sắt/58 g)',58)],['Đun sôi {1} nước, thêm {0} yến mạch. Hạ lửa nhỏ và khuấy đến khi cháo sánh.','Tắt bếp, trộn {2} chuối thái lát và {3} hạt chia. Rắc {4} Grape-Nuts ngay trước khi ăn.']),
   recipe('measured-sweet-spread','Khoai lang luộc với '+spread.toLowerCase(),'steamed',20,[g('Khoai lang chín đã bỏ vỏ',100),g(spread,30)],['Luộc khoai ở lửa vừa đến khi xiên qua dễ dàng. Để ráo, bỏ vỏ rồi cân {0}.','Dùng nóng cùng {1} sốt.'])
  ],[
   recipe('measured-brown-rice','Cơm gạo lứt','rice',40,[g('Cơm gạo lứt chín',300)],['Vo gạo và nấu theo hướng dẫn trên bao bì. Khi cơm chín, xới tơi rồi cân {0} cơm.']),
   recipe('measured-beans',bean+' luộc','sides',35,[g(bean+' luộc để ráo',160),g('Muối i-ốt Bạc Liêu',2)],['Dùng đậu đã nấu chín mềm và để ráo. Đậu đỏ khô cần luộc sôi kỹ theo hướng dẫn trên bao bì trước khi dùng.','Cân {0} đậu, hâm nóng trên lửa vừa rồi trộn {1} muối sau khi tắt bếp.']),
   recipe('measured-greens',veg+' luộc với nori','steamed',10,[g(veg+' luộc để ráo',125),g('Nori Clearspring Untoasted',3)],['Rửa rau và cắt miếng vừa ăn. Luộc trong nước sôi đến khi vừa mềm, để ráo rồi cân {0}.','Bẻ vụn {1} nori và rắc lên rau ngay trước khi ăn.'])
  ],[
   recipe('measured-tofu','Đậu hũ áp chảo nấm','rice',15,[g('Đậu hũ Cauldron Authentic Plant-Based',130),g('Nấm mỡ Monterey High Vitamin D sống',150)],['Cắt {0} đậu hũ thành lát. Lau sạch rồi thái {1} nấm.','Áp chảo chống dính ở lửa vừa đến khi đậu nóng đều và nấm chín.']),
   recipe('measured-sweet-avocado','Khoai lang luộc với bơ','steamed',20,[g('Khoai lang chín đã bỏ vỏ',100),g('Bơ đã bỏ vỏ và hạt',80)],['Luộc khoai đến mềm, để ráo rồi cân {0} khoai đã bỏ vỏ.','Dùng cùng {1} bơ cắt lát.'])
  ]
 ]);
 const payload=JSON.stringify(data);
 if(!isVeganWeek(data,week)||Buffer.byteLength(payload)>VEGAN_PACKAGE_MAX_BYTES) throw Error('invalid '+week);
 fs.writeFileSync(path.join(os.tmpdir(),'tutam-metric-'+week+'.json'),payload);
 console.log(week,Buffer.byteLength(payload));
}

