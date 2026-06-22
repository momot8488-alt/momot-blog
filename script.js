// MoMot Blog - Simple scripts
document.addEventListener('DOMContentLoaded', function() {
  // Mobile nav toggle
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function() {
      links.classList.toggle('open');
    });
  }

  // Set active nav link
  var currentPath = window.location.pathname;
  var navLinks = document.querySelectorAll('.nav-links a');
  navLinks.forEach(function(link) {
    var href = link.getAttribute('href');
    if (href && currentPath.endsWith(href.replace('./', ''))) {
      link.classList.add('active');
    } else if (href === './index.html' && (currentPath.endsWith('/') || currentPath.endsWith('index.html'))) {
      link.classList.add('active');
    }
  });
});
