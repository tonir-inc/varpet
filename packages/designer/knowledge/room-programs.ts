/** Furniture programs. Explicit customer exclusions override a role, never silently. */
export interface RoomProgram {
 search_kinds:string[];
 essentials:{role:string;kinds:string[];count:number;preferred_kinds?:string[]}[];
 relations:string[];
 play_space_side_m?:number;
}
export const roomPrograms:Record<string,RoomProgram> & Record<'living'|'bedroom'|'dining'|'office'|'kitchen'|'entry'|'bathroom'|'kids',RoomProgram>={
 kids:{search_kinds:['bed','desk','chair','shelf','wardrobe','cabinet','lamp'],essentials:[{role:'bed',kinds:['bed'],count:1},{role:'work_surface',kinds:['desk'],count:1},{role:'work_seat',kinds:['chair','office_chair'],count:1},{role:'storage',kinds:['shelf','wardrobe','cabinet'],count:1},{role:'task_light',kinds:['lamp'],count:1}],relations:['headboard_on_solid_wall','chair_faces_work_surface','chair_pullout_clear','clear_play_space','storage_front_clear'],play_space_side_m:1.2},
 living:{search_kinds:['sofa','chair','rug','lamp','table','shelf'],essentials:[{role:'seating_anchor',kinds:['sofa'],count:1},{role:'rug',kinds:['rug'],count:1},{role:'light',kinds:['lamp'],count:1},{role:'table',kinds:['table','coffee_table','side_table'],count:1},{role:'focal_point',kinds:['shelf','tv_unit','cabinet'],count:1}],relations:['seats_face_focal_point_or_each_other','conversation_within_3m','rug_under_front_legs','table_and_light_within_reach','keep_circulation_clear']},
 bedroom:{search_kinds:['bed','nightstand','wardrobe','dresser','lamp','rug','table','cabinet'],essentials:[{role:'bed',kinds:['bed'],count:1},{role:'nightstands',kinds:['nightstand','table','cabinet'],preferred_kinds:['nightstand','table','cabinet'],count:2},{role:'bedside_lights',kinds:['lamp'],count:2},{role:'storage',kinds:['wardrobe','dresser','cabinet'],preferred_kinds:['wardrobe','dresser','cabinet'],count:1}],relations:['headboard_on_solid_wall','nightstand_each_open_side','light_each_bedside','bed_access_both_sides','storage_front_clear']},
 dining:{search_kinds:['table','chair','lamp','shelf'],essentials:[{role:'dining_anchor',kinds:['table','dining_table'],count:1},{role:'dining_seats',kinds:['chair'],count:2},{role:'light',kinds:['lamp'],count:1}],relations:['chairs_face_table','chair_pullout_clear','light_serves_table']},
 office:{search_kinds:['desk','chair','lamp','shelf','table'],essentials:[{role:'work_surface',kinds:['desk','table'],preferred_kinds:['desk','table'],count:1},{role:'work_seat',kinds:['office_chair','chair'],count:1},{role:'task_light',kinds:['lamp'],count:1},{role:'storage',kinds:['shelf','cabinet'],count:1}],relations:['chair_faces_work_surface','side_daylight','chair_pullout_clear']},
 kitchen:{search_kinds:['cabinet','table','chair','lamp'],essentials:[{role:'storage',kinds:['cabinet'],count:1},{role:'work_surface',kinds:['table'],count:1}],relations:['retain_installed_components','work_aisle_clear','do_not_invent_appliances']},
 entry:{search_kinds:['cabinet','bench','stool','ottoman','chair','lamp'],essentials:[{role:'storage',kinds:['cabinet'],count:1},{role:'seat',kinds:['bench','stool','ottoman','chair'],preferred_kinds:['bench','stool','ottoman','chair'],count:1}],relations:['door_swing_clear','entry_path_clear']},
 bathroom:{search_kinds:['cabinet'],essentials:[{role:'storage',kinds:['cabinet'],count:1}],relations:['retain_plumbing_and_installed_components','fixture_access_clear']},
};
export function inferRoomProgram(name:string):string|undefined {
 if(/children|kids|child(?:ren)?['’]s|nursery/i.test(name))return 'kids';
 if(/living|lounge|sitting/i.test(name))return 'living';if(/bed|sleep/i.test(name))return 'bedroom';
 if(/dining/i.test(name))return 'dining';if(/office|study|work/i.test(name))return 'office';
 if(/kitchen/i.test(name))return 'kitchen';if(/entry|hall/i.test(name))return 'entry';if(/bath|wc/i.test(name))return 'bathroom';return undefined;
}
