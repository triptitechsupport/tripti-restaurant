// Maroon "menu cover" band used at the top of the public pages, matching the
// homepage. Must be rendered inside an element with the tg-home class.
import React from 'react';
import imgCornerMandala from '@/assets/home/corner-mandala.webp';
import imgDivider from '@/assets/home/divider.webp';
import imgMandala from '@/assets/home/mandala.webp';
import '@/pages/home/home.css';
import '@/components/menu/menubook.css';

export default function PageCover({ eyebrow, title, lead, children }) {
  return (
    <section className="cover page-cover">
      <div className="grain" />
      <img className="cm tl" src={imgCornerMandala} alt="" />
      <img className="cm tr" src={imgCornerMandala} alt="" />
      <img className="cm bl" src={imgCornerMandala} alt="" />
      <img className="cm br" src={imgCornerMandala} alt="" />
      <div className="pc-in wrap">
        <img className="pc-mandala" src={imgMandala} alt="" />
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <img className="pc-div" src={imgDivider} alt="" />
        {lead && <p className="pc-lead">{lead}</p>}
        {children && <div className="pc-actions">{children}</div>}
      </div>
    </section>
  );
}
