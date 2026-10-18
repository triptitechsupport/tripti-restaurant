// One dish in "printed menu" style: name, dotted leader, price, the name in
// the other language, description, allergen codes and (when online ordering
// is on) a cart button.
import React from 'react';
import { ALG } from '@/pages/home/homeData.js';
import { fmtPrice } from '@/components/menu/menuData.js';

const TX = {
  de: { veg: 'Vegetarisch', nv: 'Mit Fleisch', add: '+ In den Warenkorb', less: 'Eins weniger', more: 'Eins mehr' },
  en: { veg: 'Vegetarian', nv: 'Meat', add: '+ Add to cart', less: 'One less', more: 'One more' },
};

export const VegMark = ({ veg, lang }) => (
  <span className={`vm ${veg ? 'v' : 'n'}`} title={veg ? TX[lang].veg : TX[lang].nv} role="img" aria-label={veg ? TX[lang].veg : TX[lang].nv} />
);

export default function DishRow({ d, lang, canOrder, qty = 0, onAdd, onLess, flash, as: Tag = 'li', image }) {
  const tx = TX[lang];
  const name = lang === 'de' ? d.de : d.en;
  const other = lang === 'de' ? d.en : d.de;
  const desc = lang === 'de' ? d.descDe : d.descEn;
  return (
    <Tag className={`it${flash ? ' flash' : ''}${image ? ' has-img' : ''}`} data-item={d.id}>
      {image && <img className="it-img" src={image} alt="" loading="lazy" />}
      <div className="it-body">
        <div className="it-top">
          <VegMark veg={d.veg} lang={lang} />
          <span className="it-name">{name}</span>
          <span className="lead-dots" />
          <span className="it-price">{fmtPrice(d.price, lang)}</span>
        </div>
        {other && other !== name && <div className="it-alt">{other}</div>}
        {desc && <p className="it-desc">{desc}</p>}
        {(d.alg.length > 0 || canOrder) && (
          <div className="it-meta">
            {d.alg.map((a) => (
              <span key={a} className="al" title={ALG[a] ? ALG[a][lang === 'de' ? 0 : 1] : ''}>{a}</span>
            ))}
            {canOrder && (qty === 0 ? (
              <button className="add" type="button" onClick={() => onAdd(d)}>{tx.add}</button>
            ) : (
              <span className="qty">
                <button type="button" aria-label={tx.less} onClick={() => onLess(d)}>−</button>
                <b aria-live="polite">{qty}</b>
                <button type="button" aria-label={tx.more} onClick={() => onAdd(d)}>+</button>
              </span>
            ))}
          </div>
        )}
      </div>
    </Tag>
  );
}
