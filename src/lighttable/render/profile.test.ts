import { describe, expect, it } from 'vitest';
import { assertComposition } from '../data/types';
import { copyComposition, createComposition } from '../model/types';
import { Session } from '../model/session';

const fixture = () => createComposition('profile-test',
  [{assetId:'a',assetRevision:1},{assetId:'b',assetRevision:1}],
  [{x:400,y:300},{x:300,y:400}], 987);

describe('explicit rendering profile identity', () => {
  it('keeps new/v8 pairs on 2 and only preserves the existing 1 -> 2 rule', () => {
    const c=fixture();
    expect(c.profile.version).toBe(2);
    for(const version of [1,2,3] as const){
      c.profile.version=version;
      const copy=copyComposition(c);
      expect(copy.profile.version).toBe(version===1?2:version);
      expect(c.profile.version).toBe(version);
      expect(copy.layers).toEqual(c.layers);
      expect(copy.effects).toEqual(c.effects);
      expect(copy.seed).toBe(987);
      assertComposition(copy);
    }
  });
  it('rejects unknown profile versions rather than silently selecting a look', () => {
    const c=fixture();
    for(const version of [0,4,-1,2.5,NaN,Infinity,'3',null]){
      expect(()=>assertComposition({...c,profile:{...c.profile,version}})).toThrow();
    }
  });
  it('keeps the experimental profile and independent pair edits through history', () => {
    const a=fixture();a.profile.version=3;a.layers[0].transform.scale=1.7;
    const b=fixture();b.id='other-pair';b.effects.exposure=-1;
    const session=new Session(a);
    session.begin();session.draft.effects.exposure=.7;session.end();
    expect(session.draft.profile.version).toBe(3);
    session.undo();
    expect(session.draft).toEqual(a);
    session.replace(b);
    expect(session.draft.profile.version).toBe(2);
    session.replace(a);
    expect(session.draft).toEqual(a);
    expect(b.effects.exposure).toBe(-1);
  });
});
