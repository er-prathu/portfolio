/* One-page résumé generated only from facts already published on the portfolio. Run: node scripts/make-resume.js resume/Prathamesh-Patil-Resume.pdf
   Needs pdfkit (npm i -D pdfkit, or any local install). */
let PDFDocument; try { PDFDocument = require('pdfkit'); } catch (e) { PDFDocument = require('C:/Users/prathu/Documents/global-job-agent/node_modules/pdfkit/js/pdfkit.js'); }
const fs = require('fs');
const out = process.argv[2];

const doc = new PDFDocument({ size: 'A4', margins: { top: 42, bottom: 36, left: 50, right: 50 }, info: { Title: 'Prathamesh Patil · Résumé', Author: 'Prathamesh Patil', Subject: 'Senior Full Stack Engineer', Keywords: 'Full stack, PHP, Laravel, JavaScript, MySQL, LLM integration, MCP' } });
doc.pipe(fs.createWriteStream(out));
const W = doc.page.width - 100;
const INK = '#111111', MUTED = '#555555', ACCENT = '#B5651D';

const heading = t => {
  doc.moveDown(.55).font('Helvetica-Bold').fontSize(9.5).fillColor(ACCENT).text(t.toUpperCase(), { characterSpacing: 1 });
  const y = doc.y + 1.5; doc.moveTo(50, y).lineTo(50 + W, y).lineWidth(.6).strokeColor('#cccccc').stroke(); doc.moveDown(.35);
};
const bullets = list => list.forEach(b => doc.font('Helvetica').fontSize(9.6).fillColor(INK).text('•  ' + b, { indent: 8, lineGap: 1.4 }));

doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text('Prathamesh Patil');
doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT).text('Senior Full Stack Engineer  ·  Backend Engineering  ·  AI Integration');
doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Navi Mumbai, India (open to relocation)  ·  prathpatil3@gmail.com  ·  linkedin.com/in/prathu123  ·  github.com/er-prathu  ·  portfolio.prathpatil3.workers.dev', { lineGap: 1.5 });

heading('Summary');
doc.font('Helvetica').fontSize(9.8).fillColor(INK).text('Senior Full Stack Engineer with 8+ years of experience building web applications, backend systems and AI-powered solutions in PHP, Laravel and JavaScript. I own products from the database to the browser. At WebMD I am the sole developer of the Nolo CMS and built an LLM-powered lead qualification engine; AI-assisted development (Claude Code, the Claude API and MCP) is part of how I work every day.', { lineGap: 1.6 });

heading('Technical skills');
[['Back end', 'PHP, Laravel, CodeIgniter, Node.js, REST APIs, API integrations'],
 ['Front end', 'JavaScript, jQuery, HTML, CSS'],
 ['Data and search', 'MySQL, Elasticsearch, data modelling'],
 ['AI integration', 'LLM integrations, MCP, Claude Code, Claude API, Figma MCP, Cline'],
 ['Engineering practice', 'Application architecture, end-to-end ownership, production support, deployment']].forEach(([k, v]) => {
  doc.font('Helvetica-Bold').fontSize(9.6).fillColor(INK).text(k + ':  ', { continued: true }).font('Helvetica').text(v, { lineGap: 1.4 });
});

heading('Experience');
const role = (title, co, when, items) => {
  doc.font('Helvetica-Bold').fontSize(10.4).fillColor(INK).text(title + '  ·  ' + co, { continued: true }).font('Helvetica').fontSize(9.2).fillColor(MUTED).text('   ' + when);
  if (items) bullets(items);
  doc.moveDown(.28);
};
role('Senior Software Engineer', 'WebMD (Nolo legal team)', 'Aug 2024 – Present', [
  'Full-stack work on the Nolo legal product.',
  'Sole full-stack developer of the Nolo CMS (PHP, Laravel): frontend and backend, developed with Claude Code.',
  'Designed and built the AI lead qualification engine and its Nolo LMS integration: an LLM asks dynamic follow-up questions and scores leads in real time. Runs in production.',
  'Built the Figma-to-HTML skill (Figma MCP with Claude Code and Cline), adopted team-wide across IB engineering.',
]);
role('Software Developer', 'MediSage', 'Oct 2023 – Aug 2024');
role('Software Engineer', 'The Information Company', 'Sep 2021 – Oct 2023');
role('Senior Software Engineer', 'Neolite Infotech', 'Jan 2020 – Sep 2021');
role('Full-stack Developer', 'Centillion', 'Jun 2018 – Aug 2019');
role('Software Engineer', 'Techfryday', 'Aug 2017 – May 2018');

heading('Featured projects');
[['Nolo CMS (WebMD, confidential)', 'Sole full-stack developer; PHP and Laravel, frontend and backend; Claude Code-assisted development.'],
 ['AI lead qualification engine (WebMD, confidential)', 'LLM-powered dynamic questioning, real-time lead scoring and Nolo LMS integration.'],
 ['Figma-to-HTML engineering skill (WebMD, confidential)', 'Reusable design-to-code workflow built on the Figma MCP with Claude Code and Cline; used team-wide.'],
 ['Prathamesh\'s Desk (this portfolio, public on GitHub)', 'A 3D desk portfolio and Recruiter Mode on three.js and Cloudflare Workers, with a contact form and live weather.']].forEach(([k, v]) => {
  doc.font('Helvetica-Bold').fontSize(9.6).fillColor(INK).text(k + ':  ', { continued: true }).font('Helvetica').text(v, { lineGap: 1.4 });
});

heading('Education');
doc.font('Helvetica').fontSize(9.8).fillColor(INK).text("Bachelor's degree, University of Mumbai");
doc.end();
