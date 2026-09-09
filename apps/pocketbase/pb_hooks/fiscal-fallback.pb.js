// The first saved customer outage copy remains unchanged after reconciliation.
onRecordUpdate((e) => {
  const original = e.record.original().getString('fallbackReceipt');
  if (original && original !== 'null') {
    const canonical = value => {
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === 'object') {
        const result = {};
        Object.keys(value).sort().forEach(key => { result[key] = canonical(value[key]); });
        return result;
      }
      return value;
    };
    if (JSON.stringify(canonical(JSON.parse(original))) !==
        JSON.stringify(canonical(JSON.parse(e.record.getString('fallbackReceipt') || 'null'))))
      throw new BadRequestError('The saved outage receipt copy cannot be changed.');
  }
  e.next();
}, 'fiskaly_transactions');

onRecordDelete((e) => {
  const copy = e.record.getString('fallbackReceipt');
  if (copy && copy !== 'null') throw new BadRequestError('The saved outage receipt copy must be retained.');
  e.next();
}, 'fiskaly_transactions');
