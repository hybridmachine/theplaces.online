// Native painting pixels. All wave and texture-sampling bounds stay in open
// water, above the foreground reeds and beyond the shore stones.
export const LAKESIDE_COINCIDENCES={version:1,width:1672,height:941,locations:{
  'shore-reflection':{center:[934,681],radius:[28,8]},
  'open-water':{center:[1160,664],radius:[31,8]},
  'near-water':{center:[1348,739],radius:[32,10]},
}};

export function validCoincidenceArt(art){
  return art?.version===1&&art.width===1672&&art.height===941&&!!art.locations&&
    Object.keys(art.locations).length>0&&Object.keys(art.locations).length<=3&&
    Object.values(art.locations).every(p=>p&&Array.isArray(p.center)&&Array.isArray(p.radius)&&
      p.center.length===2&&p.radius.length===2&&[...p.center,...p.radius].every(Number.isFinite)&&
      p.radius[0]>=10&&p.radius[0]<=32&&p.radius[1]>=3&&p.radius[1]<=10&&
      p.center.every((n,i)=>n-p.radius[i]>2&&n+p.radius[i]<[art.width,art.height][i]-2));
}
