
if (typeof window !== 'undefined' && typeof window.$ !== 'undefined') {
  window.$(window).on('load', function () {
    window.$('.loader-wrapper').fadeOut(1000);
  });
} else if (typeof window !== 'undefined') {
  // Fallback without jQuery to avoid hard crash
  window.addEventListener('load', function () {
    var loaders = document.querySelectorAll('.loader-wrapper');
    loaders.forEach(function (el) {
      el.style.transition = 'opacity 1s ease';
      el.style.opacity = '0';
      setTimeout(function () {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      }, 1000);
    });
  });
}
