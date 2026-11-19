(function () {
  var f = document.getElementById('fb'), msg = document.getElementById('msg');
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var b = f.querySelector('button'); b.disabled = true; msg.className = ''; msg.textContent = 'Sending...';
    var fd = new FormData(f);
    fetch('/api/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: fd.get('kind'), title: fd.get('title'), details: fd.get('details'), website: fd.get('website'), version: 'site', platform: 'web' })
    }).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); }).then(function (x) {
      if (x.j.ok) { msg.className = 'ok'; msg.textContent = 'Thank you! We read every suggestion.'; f.reset(); }
      else { msg.className = 'err'; msg.textContent = x.s === 429 ? 'Too many suggestions just now, please try again later.' : (x.j.error || 'Something went wrong.'); }
    }).catch(function () { msg.className = 'err'; msg.textContent = 'Could not reach the server. Check your connection.'; })
      .then(function () { b.disabled = false; });
  });
})();
