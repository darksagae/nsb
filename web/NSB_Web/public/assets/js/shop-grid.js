/**
 * Shop grid filter sidebar (mobile). Depends on jQuery (loaded via root layout beforeInteractive).
 */
(function runShopGridWhenJqueryReady(attempt) {
  if (typeof window === 'undefined') return;
  var $ = window.jQuery;
  if (!$) {
    if (attempt > 100) return;
    setTimeout(function () {
      runShopGridWhenJqueryReady(attempt + 1);
    }, 20);
    return;
  }

  $(function () {
    'use strict';

    $('.btn-filter-mobile').on('click', function () {
      $('.filter-column').removeClass('d-none d-xl-block');
      $('.filter-column').addClass('filter-sidebar-mobile');
    });

    $('.filter-close').on('click', function () {
      $('.filter-column').addClass('d-none d-xl-block');
      $('.filter-column').removeClass('filter-sidebar-mobile');
    });
  });
})(0);
