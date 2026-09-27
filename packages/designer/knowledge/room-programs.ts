/** Furniture programs. Explicit customer exclusions override a role, never silently. */
export interface RoomProgram {
 search_kinds:string[];
 essentials:{role:string;kinds:string[];count:number;preferred_kinds?:string[]}[];
 relations:string[];
 /** Advice for the proposal, not a layout gate. */
 guidelines?:string[];
 play_space_side_m?:number;
}
export const roomPrograms:Record<string,RoomProgram> & Record<'living'|'bedroom'|'dining'|'office'|'kitchen'|'entry'|'bathroom'|'kids'|'balcony',RoomProgram>={
 kids:{guidelines:["Kids' rooms: anchor bookcases, dressers and wardrobes to the wall; keep climbable furniture (beds, desks, shelves) away from windows and balcony railings."],search_kinds:['bed','desk','chair','shelf','wardrobe','cabinet','lamp'],essentials:[{role:'bed',kinds:['bed'],count:1},{role:'work_surface',kinds:['desk'],count:1},{role:'work_seat',kinds:['chair','office_chair'],count:1},{role:'storage',kinds:['shelf','wardrobe','cabinet'],count:1},{role:'task_light',kinds:['lamp'],count:1}],relations:['headboard_on_solid_wall','chair_faces_work_surface','chair_pullout_clear','clear_play_space','storage_front_clear'],play_space_side_m:1.2},
 living:{search_kinds:['sofa','chair','rug','lamp','table','shelf'],essentials:[{role:'seating_anchor',kinds:['sofa'],count:1},{role:'rug',kinds:['rug'],count:1},{role:'light',kinds:['lamp'],count:1},{role:'table',kinds:['table','coffee_table','side_table'],count:1},{role:'focal_point',kinds:['shelf','tv_unit','cabinet'],count:1}],relations:['seats_face_focal_point_or_each_other','conversation_within_3m','rug_under_front_legs','table_and_light_within_reach','keep_circulation_clear']},
 bedroom:{search_kinds:['bed','nightstand','wardrobe','dresser','lamp','rug','table','cabinet'],essentials:[{role:'bed',kinds:['bed'],count:1},{role:'nightstands',kinds:['nightstand','table','cabinet'],preferred_kinds:['nightstand','table','cabinet'],count:2},{role:'bedside_lights',kinds:['lamp'],count:2},{role:'storage',kinds:['wardrobe','dresser','cabinet'],preferred_kinds:['wardrobe','dresser','cabinet'],count:1}],relations:['headboard_on_solid_wall','nightstand_each_open_side','light_each_bedside','bed_access_both_sides','storage_front_clear']},
 dining:{search_kinds:['table','chair','lamp','shelf'],essentials:[{role:'dining_anchor',kinds:['table','dining_table'],count:1},{role:'dining_seats',kinds:['chair'],count:2},{role:'light',kinds:['lamp'],count:1}],relations:['chairs_face_table','chair_pullout_clear','light_serves_table']},
 office:{search_kinds:['desk','chair','lamp','shelf','table'],essentials:[{role:'work_surface',kinds:['desk','table'],preferred_kinds:['desk','table'],count:1},{role:'work_seat',kinds:['office_chair','chair'],count:1},{role:'task_light',kinds:['lamp'],count:1},{role:'storage',kinds:['shelf','cabinet'],count:1}],relations:['chair_faces_work_surface','side_daylight','chair_pullout_clear']},
 kitchen:{search_kinds:['cabinet','table','chair','lamp'],essentials:[{role:'storage',kinds:['cabinet'],count:1},{role:'work_surface',kinds:['table'],count:1}],relations:['retain_installed_components','work_aisle_clear','do_not_invent_appliances']},
 entry:{search_kinds:['cabinet','bench','stool','ottoman','chair','lamp'],essentials:[{role:'storage',kinds:['cabinet'],count:1},{role:'seat',kinds:['bench','stool','ottoman','chair'],preferred_kinds:['bench','stool','ottoman','chair'],count:1}],relations:['door_swing_clear','entry_path_clear']},
 balcony:{search_kinds:['chair','bench','table','plant'],essentials:[{role:'seat',kinds:['chair','bench','stool'],preferred_kinds:['chair','bench','stool'],count:1},{role:'bistro_table',kinds:['table','side_table','coffee_table'],count:1},{role:'plant',kinds:['plant'],count:1}],relations:['railing_clear','table_beside_seat','keep_circulation_clear']},
 bathroom:{search_kinds:['cabinet'],essentials:[{role:'storage',kinds:['cabinet'],count:1}],relations:['retain_plumbing_and_installed_components','fixture_access_clear']},
};
export function inferRoomProgram(name:string):string|undefined {
 if(/balcon|loggia|terrace|patio|veranda|балкон|лоджи|террас|պատշգամբ/i.test(name))return 'balcony';
 if(/children|kids|child(?:ren)?['’]s|nursery/i.test(name))return 'kids';
 if(/living|lounge|sitting/i.test(name))return 'living';if(/bed|sleep/i.test(name))return 'bedroom';
 if(/dining/i.test(name))return 'dining';if(/office|study|work/i.test(name))return 'office';
 if(/kitchen/i.test(name))return 'kitchen';if(/entry|hall/i.test(name))return 'entry';if(/bath|wc/i.test(name))return 'bathroom';return undefined;
}
/** Optional pieces for "add more / fill the room", in priority order, after the essentials. `total` is how many of
 * the role's kinds a well furnished room holds (essentials included). Placement: floor slots, on furniture tops,
 * hung on a wall, or over a window. Every piece passes the same hard checks as the essentials. */
export interface ExtraRole {
 role:string;total:number;place:'floor'|'on'|'wall'|'window';near?:'seating'|'bed'|'window';
 queries:ExtraQuery[];
 /** Pieces placed with it when it would otherwise leave a composition check unmet (a chair's table and lamp). */
 with?:(ExtraQuery&{fixes:string})[];
}
export interface ExtraQuery {kind:string;text?:string;max_w?:number;max_d?:number;max_h?:number;min_h?:number}
const art:ExtraRole={role:'wall_art',total:2,place:'wall',queries:[{kind:'wall_art',text:'framed art print',max_w:1.2,max_h:1}]};
const curtains:ExtraRole={role:'curtains',total:2,place:'window',queries:[{kind:'curtain',text:'curtain pair on rod'},{kind:'blind',text:'roller blind'}]};
const plant=(total:number):ExtraRole=>({role:'plants',total,place:'floor',near:'window',queries:[{kind:'plant',text:'potted floor plant',max_w:.8,max_d:.8,min_h:.6}]});
const decor=(total:number,text='coffee table books'):ExtraRole=>({role:'decor',total,place:'on',queries:[{kind:'vase',text:'flowers in vase',max_w:.35,max_d:.35,max_h:.6},{kind:'books',text,max_w:.4,max_d:.35,max_h:.3},{kind:'candle',text:'candle',max_w:.25,max_d:.25,max_h:.4}]});
export const roomExtras:Record<string,ExtraRole[]>={
 living:[
  {role:'accent_seating',total:2,place:'floor',near:'seating',queries:[{kind:'chair',text:'upholstered accent armchair',max_w:.9,max_d:.95}],
   with:[{kind:'table',text:'small side end table',max_w:.55,max_d:.55,max_h:.7,fixes:'seat_table'},{kind:'lamp',text:'floor reading lamp',max_w:.45,max_d:.45,min_h:1.2,fixes:'seat_light'}]},
  {role:'side_tables',total:3,place:'floor',near:'seating',queries:[{kind:'table',text:'small side end table',max_w:.6,max_d:.6,max_h:.7}]},
  {role:'pouf',total:1,place:'floor',near:'seating',queries:[{kind:'ottoman',text:'round pouf ottoman',max_w:.8,max_d:.8,max_h:.5}]},
  plant(2),
  {role:'storage',total:2,place:'floor',queries:[{kind:'cabinet',text:'sideboard console cabinet',max_w:1.6,max_d:.5},{kind:'shelf',text:'bookcase',max_w:1.2,max_d:.45}]},
  decor(3),art,curtains,
 ],
 bedroom:[
  {role:'rug',total:1,place:'floor',near:'bed',queries:[{kind:'rug',text:'area rug',max_w:2.5,max_d:1.8}]},
  {role:'bench',total:1,place:'floor',near:'bed',queries:[{kind:'bench',text:'bed end bench',max_w:1.4,max_d:.5,max_h:.55}]},
  {role:'dresser',total:1,place:'floor',queries:[{kind:'dresser',text:'chest of drawers',max_w:1.4,max_d:.55}]},
  {role:'accent_chair',total:1,place:'floor',queries:[{kind:'chair',text:'upholstered accent chair',max_w:.8,max_d:.85}]},
  plant(1),decor(2,'books'),art,curtains,
 ],
 kids:[
  {role:'rug',total:1,place:'floor',queries:[{kind:'rug',text:'kids play rug',max_w:2,max_d:1.6}]},
  {role:'toy_storage',total:1,place:'floor',queries:[{kind:'basket',text:'toy storage basket',max_w:.5,max_d:.5,max_h:.6}]},
  {role:'shelf',total:2,place:'floor',queries:[{kind:'shelf',text:'kids bookcase',max_w:1,max_d:.4}]},
  {role:'pouf',total:1,place:'floor',queries:[{kind:'ottoman',text:'pouf',max_w:.7,max_d:.7,max_h:.5}]},
  {role:'toys',total:2,place:'on',queries:[{kind:'toy',text:'plush toy',max_w:.4,max_d:.35,max_h:.45},{kind:'books',text:'books',max_w:.4,max_d:.35,max_h:.3}]},
  art,curtains,
 ],
 office:[{role:'storage',total:2,place:'floor',queries:[{kind:'shelf',text:'bookcase',max_w:1.2,max_d:.45},{kind:'cabinet',text:'filing cabinet',max_w:1,max_d:.55}]},plant(1),decor(2,'books'),art,curtains],
 dining:[{role:'sideboard',total:1,place:'floor',queries:[{kind:'cabinet',text:'sideboard buffet',max_w:1.6,max_d:.5}]},plant(1),decor(1),art,curtains],
 entry:[{role:'mirror',total:1,place:'wall',queries:[{kind:'mirror',text:'wall mirror',max_w:1,max_h:1.3}]},plant(1),decor(1),art],
 balcony:[{role:'plants',total:3,place:'floor',queries:[{kind:'plant',text:'potted plant',max_w:.6,max_d:.6,min_h:.5}]},{role:'lantern',total:1,place:'on',queries:[{kind:'lantern',text:'lantern',max_w:.3,max_d:.3,max_h:.5},{kind:'candle',text:'candle',max_w:.25,max_d:.25,max_h:.4}]}],
 kitchen:[plant(1),decor(1)],
 bathroom:[plant(1)],
};
