import {it,expect} from 'vitest';
import {joinSplitScriptWords} from '../src/lib/concept/voice-alignment';
/** Live Clay 2026-10-23: Whisper returned "Gaza" + "lighting." for the script word "Gazalighting" and the
 * strict validator stopped the film with a client-facing message. */
it('joins recogniser tokens whose letters exactly form one script word, and nothing else',()=>{
 const words=[{word:"That's",start:50,end:50.3},{word:'classic',start:50.3,end:50.8},{word:'Gaza',start:50.8,end:51.1},{word:'lighting.',start:51.1,end:51.7}];
 const joined=joinSplitScriptWords(words,["That's",'classic','Gazalighting.']);
 expect(joined).toEqual([{word:"That's",start:50,end:50.3},{word:'classic',start:50.3,end:50.8},{word:'Gazalighting.',start:50.8,end:51.7}]);
 // A different word is never merged or guessed.
 expect(joinSplitScriptWords(words,["That's",'classic','gaslighting.'])).toEqual(words);
 expect(joinSplitScriptWords([{word:'anti',start:1,end:1.2},{word:'semitic',start:1.2,end:1.6}],['antisemitic'])).toEqual([{word:'antisemitic',start:1,end:1.6}]);
});
