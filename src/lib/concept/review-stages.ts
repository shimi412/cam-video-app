/** This classifier only routes feedback. It never authorizes a generation. */
export type FeedbackStage = "visual" | "finishing" | "mixed";
export const FINISHING_NOTICE = "This feedback concerns sound, editing or subtitles. It is saved for the next step, Sound, editing & subtitles. Here, approve only the images, characters and movements.";
export function feedbackStage(text:string):FeedbackStage {
 const value=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 const finishing=/\b(music|sound|audio|voice|volume|narration|subtitle[s]?|caption[s]?|editing|edit|montage|pacing|transition[s]?|musique|son|voix|sous[ -]?titres?|rythme|fondu[s]?)\b/.test(value);
 const visual=/\b(character[s]?|personnage[s]?|face|visage|camera|lighting|lumiere|costume|outfit|clay|soldier[s]?|soldat[s]?|doctor[s]?|medecin[s]?|symbol[s]?|symbole[s]?|pastille[s]?|background|decor|movement[s]?|mouvement[s]?)\b/.test(value);
 return finishing?(visual?"mixed":"finishing"):"visual";
}
export const VIDEO_JOURNEY=["Storyboard","Video budget","Video visuals","Sound, editing & subtitles","Download"] as const;
