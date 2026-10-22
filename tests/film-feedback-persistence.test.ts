import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {replaceFilmComment,type FilmComment} from '../src/lib/concept/film-feedback';
import {filmNoteHash} from '../src/lib/concept/film-feedback-batch';
it('replaces only the locked note atomically and replays a duplicate save',()=>{
 const note:FilmComment={id:randomUUID(),target:'a'.repeat(64),text:'Move the camera',seconds:13,actor:'human',at:new Date().toISOString()};
 const neighbor={...note,id:randomUUID(),text:'Lower music',stage:'finishing' as const};
 const book={version:1 as const,comments:[note,neighbor]},updated={...note,id:randomUUID(),text:'Move the camera more slowly'};
 const replaces={id:note.id,hash:filmNoteHash(note)};
 const result=replaceFilmComment(book,updated,60,replaces,[note.id]);
 expect(result.comments).toEqual([neighbor,updated]);expect(book.comments).toEqual([note,neighbor]);
 expect(replaceFilmComment(result,updated,60,replaces,[])).toEqual(result);
 expect(()=>replaceFilmComment(book,{...updated,seconds:70},60,replaces,[note.id])).toThrow(/within/);
 expect(book.comments).toEqual([note,neighbor]);
 expect(()=>replaceFilmComment(book,updated,60,{...replaces,hash:'b'.repeat(64)},[note.id])).toThrow(/changed/);
 expect(()=>replaceFilmComment(book,updated,60,replaces,[])).toThrow(/changed/);
});
