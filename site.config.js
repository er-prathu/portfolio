/*
 * Profile links and the résumé, for the desk (room.html). Everything that links to you reads from here.
 *
 * RÉSUMÉ: put your PDF in the resume/ folder and set resumePdf to its path, e.g.
 *     resumePdf: 'resume/Prathamesh-Patil-Resume.pdf',
 * Every "Download résumé" button, the floppy disk on the desk and the terminal's `resume` command then offer it.
 * While resumePdf is empty, those places offer "résumé on request" (email / LinkedIn) instead of a download.
 * `npm run build` stops with an error if resumePdf points at a file that doesn't exist.
 */
window.DESK_SITE = {
  resumePdf: 'resume/Prathamesh-Patil-Resume.pdf',   // generated from the portfolio's own published facts; replace it with your own PDF at any time
  resumeDownloadName: 'Prathamesh-Patil-Resume.pdf',   // the filename visitors' browsers save it as

  email: 'prathpatil3@gmail.com',
  linkedin: 'https://www.linkedin.com/in/prathu123',
  github: 'https://github.com/er-prathu',

  // Public repositories shown under Projects, read live from GitHub's public API (no token). Forks are skipped.
  githubUser: 'er-prathu',
  githubPinned: ['portfolio'],   // shown first, in this order; the rest follow by last update
};
