/** Milestones use recorded actions, rather than matching unrelated prose. */
export function milestones(history) {
  const has = (re) => history.find((h) => re.test(h.text));
  const booked = history.filter((h) => / booked with /.test(h.text));
  const verified = history.filter((h) => /^Payment of .* verified$/.test(h.text));
  const sum = verified.reduce((s, h) => {
    const amount = h.text.match(/₹([\d,]+(?:\.\d+)?)/)?.[1];
    return s + (Number(amount?.replaceAll(',', '')) || 0);
  }, 0);
  return [
    ['Event created', has(/draft started|plan created from your details/)],
    ['Event plan built', has(/^Event plan created$/) || has(/plan created from your details/)],
    [`Vendors confirmed${booked.length ? ` (${booked.length})` : ''}`, booked[booked.length - 1]],
    [`Payments verified${sum ? ` (₹${sum.toLocaleString('en-IN')})` : ''}`, verified[verified.length - 1]],
    ['Event day', history.find((h) => h.group === 'execution' && /: (checked in|started)$/.test(h.text))],
    ['Completion', has(/^Event completed$/)],
  ];
}
