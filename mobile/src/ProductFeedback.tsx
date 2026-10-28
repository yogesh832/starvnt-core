import React, { useState } from 'react';
import { external } from './api/runtime';
import { Button, Card, ErrorNotice, Txt, useAction } from './ui';

export function ProductFeedback({ kind, reference }: { kind: 'EVENT' | 'NOTIFICATION'; reference: string }) {
  const [saved, setSaved] = useState(false);
  const action = useAction();
  if (!reference) return null;
  const send = (score: number) => void action.run(async () => {
    await external.call('/customer/feedback', 'POST', { kind, reference, score });
    setSaved(true);
  });
  return <Card>
    <Txt bold>{kind === 'EVENT' ? 'How useful was your event plan?' : 'Was this notification useful?'}</Txt>
    {saved ? <Txt muted>Thanks, your feedback is saved.</Txt> : <>
      <ErrorNotice message={action.error} />
      {kind === 'EVENT' ? [1, 2, 3, 4, 5].map(score => <Button key={score} title={`${score} / 5`} secondary={score < 5} busy={action.busy} onPress={() => send(score)} />) : <><Button title="Not useful" secondary busy={action.busy} onPress={() => send(1)} /><Button title="Useful" busy={action.busy} onPress={() => send(5)} /></>}
    </>}
  </Card>;
}
