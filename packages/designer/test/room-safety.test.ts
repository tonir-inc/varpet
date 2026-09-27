import {test,expect} from 'vitest';
import {roomPrograms} from '../knowledge/room-programs.js';

test('kids program carries anchoring and window safety as guidance, not a gate',()=>{
 expect(roomPrograms.kids.guidelines).toContain("Kids' rooms: anchor bookcases, dressers and wardrobes to the wall; keep climbable furniture (beds, desks, shelves) away from windows and balcony railings.");
 expect(roomPrograms.kids.relations).toEqual(['headboard_on_solid_wall','chair_faces_work_surface','chair_pullout_clear','clear_play_space','storage_front_clear']);
});
