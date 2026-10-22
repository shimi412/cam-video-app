/** Typed Attack stops. A deterministic failure (validator, build check, alignment,
 * confirmed provider failure, price change) is shown to the client as written and
 * never sent to the paid recovery supervisor: retrying it cannot change its outcome. */
export type StopKind='needs-attention'|'review-budget'|'replace-failed';
export class ComicStop extends Error{
 constructor(public kind:StopKind,public clientMessage:string,detail?:string){super(detail??clientMessage);}
}
/** The provider confirmed this request failed (or refused it). Other media is preserved. */
export class MediaFailed extends Error{constructor(public key:string,detail:string){super(detail);}}
/** The provider tool answered with isError: a definitive refusal, not an unknown outcome. */
export class ProviderToolError extends Error{}
