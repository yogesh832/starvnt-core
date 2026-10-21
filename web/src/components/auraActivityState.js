/** Compare saved fields, ignoring the poll timestamp and resetting on scope changes. */
export function activityState(previous, activity) {
  if (!activity) return null;
  const scope = JSON.stringify(activity.scope);
  const rows = new Map(activity.items.map(row => [row.id, JSON.stringify(row)]));
  const sameScope = previous?.scope === scope;
  const changes = sameScope ? { ...previous.changes } : {};
  if (sameScope) for (const [id, value] of rows) {
    if (!previous.rows.has(id)) changes[id] = 'New';
    else if (previous.rows.get(id) !== value) changes[id] = 'Updated';
  }
  for (const id of Object.keys(changes)) if (!rows.has(id)) delete changes[id];
  return { scope, rows, changes };
}
