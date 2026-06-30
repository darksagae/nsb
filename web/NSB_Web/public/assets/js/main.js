
if (typeof window !== 'undefined' && typeof window.$ !== 'undefined') {
  $(function () {
    "use strict";

    // Global Slick slider configuration - Override default arrows with custom SVG icons
    if ($.fn && $.fn.slick && $.fn.slick.defaults) {
      $.fn.slick.defaults.prevArrow = "<button type='button' class='slick-prev pull-left'><svg class='custom-arrow-icon' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M15 18L9 12L15 6' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg></button>";
      $.fn.slick.defaults.nextArrow = "<button type='button' class='slick-next pull-right'><svg class='custom-arrow-icon' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M9 18L15 12L9 6' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg></button>";
    }

    // Theme switcher 
    $("#LightTheme").on("click", function () {
      $("html").attr("class", "light-theme");
    });

    $("#DarkTheme").on("click", function () {
      $("html").attr("class", "dark-theme");
    });

    $(".dark-mode-icon").on("click", function () {
      $(".mode-icon i").toggleClass("bi bi-brightness-high bi bi-moon");
      $("html").toggleClass("dark-theme");
    });

    /* Back to top */
    $(document).ready(function () {
      $(window).on("scroll", function () {
        $(this).scrollTop() > 300 ? $(".back-to-top").fadeIn() : $(".back-to-top").fadeOut();
      });
      $(".back-to-top").on("click", function () {
        $("html, body").animate({
          scrollTop: 0
        }, 600);
        return !1;
      });
    });

    /* list active */
    $(function () {
      for (var e = window.location, o = $(".primary-menu li a").filter(function () {
        return this.href == e;
      }).addClass("active").parent().addClass("active"); o.is("li");) o = o.parent("").addClass("show").parent("").addClass("active");
    });
  });
}


const carousel = document.querySelector('#productCarousel');
const thumbnails = document.querySelectorAll('.thumbnail-img');
if (carousel && typeof bootstrap !== 'undefined' && typeof bootstrap.Carousel === 'function') {
  const bsCarousel = new bootstrap.Carousel(carousel, {
    interval: 3000,
    ride: 'carousel'
  });

  // Sync thumbnail highlight with active slide
  carousel.addEventListener('slid.bs.carousel', function (event) {
    thumbnails.forEach(t => t.classList.remove('active-thumb'));
    if (thumbnails[event.to]) {
      thumbnails[event.to].classList.add('active-thumb');
    }
  });
}
