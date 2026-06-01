/* ==========================================================================
   Small Markdown renderer + editor with preview toggle
   Supports: # h1..h6, **bold**, *italic*, `code`, ```fenced```,
             - lists, > quotes, [text](url), images, line breaks
   Output is escaped HTML — safe-ish for our use case.
   ========================================================================== */
(function (global) {
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 마크다운 링크/이미지 URL 살균 — javascript:/vbscript:/data: 등 위험 스킴 차단(저장형 XSS 방지)
  // 스킴이 있으면 http/https/mailto 만 허용, 스킴 없는 상대/앵커 URL 은 통과
  function mdSafeUrl(url) {
    const u = String(url).trim();
    if (/^[a-z][a-z0-9+.\-]*:/i.test(u) && !/^(https?|mailto):/i.test(u)) return '#';
    return u;
  }

  function inline(s) {
    let t = escapeHtml(s);
    // inline code first to protect inside
    t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
    // images ![alt](url)
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) =>
      `<img src="${mdSafeUrl(url)}" alt="${alt}" />`);
    // links [text](url)
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, url) =>
      `<a href="${mdSafeUrl(url)}" target="_blank" rel="noopener noreferrer">${txt}</a>`);
    // bold **x** or __x__
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // italic *x* or _x_
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
    // strikethrough ~~x~~
    t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return t;
  }

  function renderMD(src) {
    if (!src) return '';
    const lines = String(src).replace(/\r\n/g, '\n').split('\n');
    let html = '';
    let i = 0;
    let inUL = false, inOL = false, inBQ = false, inCode = false, codeBuf = [];

    function closeAll() {
      if (inUL) { html += '</ul>'; inUL = false; }
      if (inOL) { html += '</ol>'; inOL = false; }
      if (inBQ) { html += '</blockquote>'; inBQ = false; }
    }

    while (i < lines.length) {
      const line = lines[i];

      // fenced code
      if (/^```/.test(line)) {
        if (!inCode) {
          closeAll();
          inCode = true;
          codeBuf = [];
        } else {
          html += `<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`;
          inCode = false;
        }
        i++;
        continue;
      }
      if (inCode) { codeBuf.push(line); i++; continue; }

      // headings
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        closeAll();
        const lvl = h[1].length;
        html += `<h${lvl}>${inline(h[2])}</h${lvl}>`;
        i++; continue;
      }

      // hr
      if (/^\s*---\s*$/.test(line)) { closeAll(); html += '<hr />'; i++; continue; }

      // blockquote
      const bq = line.match(/^>\s?(.*)$/);
      if (bq) {
        if (!inBQ) { closeAll(); html += '<blockquote>'; inBQ = true; }
        html += `<p>${inline(bq[1])}</p>`;
        i++; continue;
      } else if (inBQ) { html += '</blockquote>'; inBQ = false; }

      // ul
      const ul = line.match(/^\s*[-*+]\s+(.*)$/);
      if (ul) {
        if (!inUL) { closeAll(); html += '<ul>'; inUL = true; }
        html += `<li>${inline(ul[1])}</li>`;
        i++; continue;
      } else if (inUL && line.trim() !== '') { html += '</ul>'; inUL = false; }

      // ol
      const ol = line.match(/^\s*\d+\.\s+(.*)$/);
      if (ol) {
        if (!inOL) { closeAll(); html += '<ol>'; inOL = true; }
        html += `<li>${inline(ol[1])}</li>`;
        i++; continue;
      } else if (inOL && line.trim() !== '') { html += '</ol>'; inOL = false; }

      // blank line
      if (line.trim() === '') {
        closeAll();
        i++; continue;
      }

      // paragraph (consume contiguous non-empty lines)
      closeAll();
      const buf = [line];
      let j = i + 1;
      while (
        j < lines.length &&
        lines[j].trim() !== '' &&
        !/^(#{1,6})\s/.test(lines[j]) &&
        !/^```/.test(lines[j]) &&
        !/^\s*[-*+]\s/.test(lines[j]) &&
        !/^\s*\d+\.\s/.test(lines[j]) &&
        !/^>\s?/.test(lines[j]) &&
        !/^\s*---\s*$/.test(lines[j])
      ) { buf.push(lines[j]); j++; }
      html += `<p>${inline(buf.join('<br/>'))}</p>`;
      i = j;
    }
    closeAll();
    if (inCode) html += `<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`;
    return html;
  }

  global.renderMD = renderMD;
})(window);
