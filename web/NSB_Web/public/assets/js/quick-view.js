// Quick View Modal Functionality with Dynamic Slideshow
document.addEventListener('DOMContentLoaded', function () {
    let currentVehicleData = null;
    let slideshowInterval = null;
    let isPlaying = true;
    let currentSlideIndex = 0;
    let totalSlides = 0;
    let slideshowSpeed = 4000; // 4 seconds
    const currencySymbol = document.querySelector('meta[name="currency"]')?.getAttribute('content') || 'USD';

    const formatCurrency = (value) => {
        const numericValue = Number(value) || 0;
        return `${currencySymbol} ${numericValue.toLocaleString()}`;
    };

    // Quick View Button Click Handler
    document.addEventListener('click', function (e) {
        if (e.target.closest('.quick-view-btn')) {
            e.preventDefault();
            const vehicleId = e.target.closest('.quick-view-btn').getAttribute('data-vehicle-id');
            // Store the vehicle ID for when modal opens
            document.getElementById('QuickViewModal').dataset.vehicleId = vehicleId;
        }
    });

    // Listen for Bootstrap modal show event (use relatedTarget to get the clicked trigger reliably)
    const quickViewModalElement = document.getElementById('QuickViewModal');
    if (quickViewModalElement) {
        quickViewModalElement.addEventListener('show.bs.modal', function (event) {
            const triggerEl = event.relatedTarget;
            const vehicleId = triggerEl?.getAttribute('data-vehicle-id') || quickViewModalElement.dataset.vehicleId;
            if (vehicleId) {
                // Persist on the modal for any subsequent logic
                quickViewModalElement.dataset.vehicleId = vehicleId;
                loadQuickViewData(vehicleId);
            }
        });

        // Reset slideshow when modal is hidden
        quickViewModalElement.addEventListener('hidden.bs.modal', function (event) {
            stopSlideshow();
            resetSlideshow();
        });
    }

    // Load Quick View Data
    function loadQuickViewData(vehicleId) {
        showQuickViewLoading();

        fetch(`/api/vehicles/${vehicleId}/quick-view`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                currentVehicleData = data;
                populateQuickViewModal(data);
                initializeSlideshow();
            })
            .catch(error => {
                console.error('Error loading quick view data:', error);
                showQuickViewError();
            });
    }

    // Show Loading State
    function showQuickViewLoading() {
        const slideshowContainer = document.getElementById('slideshowContainer');
        const thumbnailWrapper = document.getElementById('thumbnailWrapper');

        slideshowContainer.innerHTML = `
            <div class="slideshow-loading">
                <div class="spinner-border" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>
        `;

        thumbnailWrapper.innerHTML = '';
    }

    // Show Error State
    function showQuickViewError() {
        const slideshowContainer = document.getElementById('slideshowContainer');
        slideshowContainer.innerHTML = `
            <div class="slideshow-loading">
                <div class="text-center">
                    <i class="bi bi-exclamation-triangle text-warning" style="font-size: 2rem;"></i>
                    <p class="mt-2">Failed to load vehicle images</p>
                </div>
            </div>
        `;
    }

    // Populate Quick View Modal
    function populateQuickViewModal(vehicle) {
        // Update vehicle information
        document.getElementById('quickViewVehicleTitle').textContent = `${vehicle.brand?.name || ''} ${vehicle.model || ''}`;
        document.getElementById('quickViewVehicleSubtitle').textContent = vehicle.description || 'Vehicle description';

        // Update price information
        const priceElement = document.getElementById('quickViewPrice');
        const originalPriceElement = document.getElementById('quickViewOriginalPrice');
        const discountElement = document.getElementById('quickViewDiscount');

        const price = Number(vehicle.price) || 0;
        const salePrice = Number(vehicle.sale_price) || 0;

        if (salePrice > 0 && salePrice < price) {
            priceElement.textContent = formatCurrency(salePrice);
            originalPriceElement.textContent = formatCurrency(price);
            originalPriceElement.style.display = 'block';

            const discount = Math.round(((price - salePrice) / price) * 100);
            discountElement.textContent = `(${discount}% off)`;
            discountElement.style.display = 'block';
        } else {
            priceElement.textContent = formatCurrency(price);
            originalPriceElement.style.display = 'none';
            discountElement.style.display = 'none';
        }

        // Update vehicle specifications
        document.getElementById('quickViewYear').textContent = vehicle.year || '-';
        document.getElementById('quickViewMileage').textContent = vehicle.mileage ? `${vehicle.mileage.toLocaleString()} km` : '-';
        document.getElementById('quickViewFuelType').textContent = vehicle.fuel_type ? vehicle.fuel_type.charAt(0).toUpperCase() + vehicle.fuel_type.slice(1) : '-';
        document.getElementById('quickViewTransmission').textContent = vehicle.transmission ? vehicle.transmission.charAt(0).toUpperCase() + vehicle.transmission.slice(1) : '-';
        document.getElementById('quickViewEngine').textContent = vehicle.engine_size ? `${vehicle.engine_size}L` : '-';
        document.getElementById('quickViewStatus').textContent = vehicle.status ? vehicle.status.charAt(0).toUpperCase() + vehicle.status.slice(1) : '-';

        // Update rating
        if (vehicle.star_rating && vehicle.star_rating > 0) {
            document.getElementById('quickViewRating').textContent = vehicle.star_rating;
            document.getElementById('quickViewRatingCount').textContent = `${vehicle.star_rating * 20} Ratings`;
        } else {
            document.getElementById('quickViewRating').textContent = '0';
            document.getElementById('quickViewRatingCount').textContent = 'No Ratings';
        }

        // Update action buttons
        const detailsBtn = document.getElementById('quickViewDetailsBtn');
        detailsBtn.href = `/vehicles/${vehicle.id}`;

        // Update share links
        const pageUrl = encodeURIComponent(`${window.location.origin}/vehicles/${vehicle.id}`);
        const title = encodeURIComponent(`${vehicle.brand?.name || ''} ${vehicle.model || ''}`.trim());
        const description = encodeURIComponent(vehicle.description || '');
        const firstImage = (vehicle.images && vehicle.images[0]) ? vehicle.images[0].image_url : '/assets/images/placeholder-vehicle.svg';
        const imageUrl = encodeURIComponent(firstImage.startsWith('http') ? firstImage : `${window.location.origin}${firstImage}`);

        const twitter = document.getElementById('quickShareTwitter');
        const facebook = document.getElementById('quickShareFacebook');
        const linkedIn = document.getElementById('quickShareLinkedIn');
        const pinterest = document.getElementById('quickSharePinterest');

        if (twitter) twitter.href = `https://twitter.com/intent/tweet?url=${pageUrl}&text=${title}`;
        if (facebook) facebook.href = `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}`;
        if (linkedIn) linkedIn.href = `https://www.linkedin.com/sharing/share-offsite/?url=${pageUrl}`;
        if (pinterest) pinterest.href = `https://pinterest.com/pin/create/button/?url=${pageUrl}&media=${imageUrl}&description=${description || title}`;

        // Update fullscreen modal title
        document.getElementById('fullscreenVehicleTitle').textContent = `${vehicle.brand?.name || ''} ${vehicle.model || ''}`;
    }

    // Initialize Slideshow
    function initializeSlideshow() {
        if (!currentVehicleData || !currentVehicleData.images || currentVehicleData.images.length === 0) {
            showQuickViewError();
            return;
        }

        const images = currentVehicleData.images;
        totalSlides = images.length;
        currentSlideIndex = 0;

        // Create slides
        createSlides(images);

        // Create thumbnails
        createThumbnails(images);

        // Update counters
        updateCounters();

        // Start auto-play
        startSlideshow();

        // Setup event listeners
        setupSlideshowControls();
    }

    // Create Slides
    function createSlides(images) {
        const slideshowContainer = document.getElementById('slideshowContainer');
        slideshowContainer.innerHTML = '';

        images.forEach((image, index) => {
            const slide = document.createElement('div');
            slide.className = `slide ${index === 0 ? 'active' : ''}`;
            slide.dataset.index = index;

            const img = document.createElement('img');
            // Fix URL to use correct server address
            let imageUrl = image.image_url || '/assets/images/placeholder-vehicle.svg';
            if (imageUrl.includes('localhost')) {
                imageUrl = imageUrl.replace('http://localhost', 'http://127.0.0.1:8000');
            }
            img.src = imageUrl;
            img.alt = `Vehicle image ${index + 1}`;
            img.className = 'main-image';

            // Add error handling for image loading
            img.onerror = function () {
                this.src = '/assets/images/placeholder-vehicle.svg';
                console.warn('Failed to load image:', imageUrl);
            };

            slide.appendChild(img);
            slideshowContainer.appendChild(slide);
        });
    }

    // Create Thumbnails
    function createThumbnails(images) {
        const thumbnailWrapper = document.getElementById('thumbnailWrapper');
        thumbnailWrapper.innerHTML = '';

        images.forEach((image, index) => {
            const thumbnail = document.createElement('div');
            thumbnail.className = `thumbnail ${index === 0 ? 'active' : ''}`;
            thumbnail.dataset.index = index;

            const img = document.createElement('img');
            // Fix URL to use correct server address
            let imageUrl = image.image_url || '/assets/images/placeholder-vehicle.svg';
            if (imageUrl.includes('localhost')) {
                imageUrl = imageUrl.replace('http://localhost', 'http://127.0.0.1:8000');
            }
            img.src = imageUrl;
            img.alt = `Vehicle thumbnail ${index + 1}`;

            // Add error handling for image loading
            img.onerror = function () {
                this.src = '/assets/images/placeholder-vehicle.svg';
                console.warn('Failed to load thumbnail:', imageUrl);
            };

            thumbnail.appendChild(img);
            thumbnailWrapper.appendChild(thumbnail);

            // Add click event
            thumbnail.addEventListener('click', () => goToSlide(index));
        });
    }

    // Setup Slideshow Controls
    function setupSlideshowControls() {
        // Navigation buttons
        document.getElementById('prevBtn').addEventListener('click', () => previousSlide());
        document.getElementById('nextBtn').addEventListener('click', () => nextSlide());

        // Play/Pause button
        document.getElementById('playPauseBtn').addEventListener('click', toggleSlideshow);

        // Fullscreen button
        document.getElementById('fullscreenBtn').addEventListener('click', openFullscreen);

        // Fullscreen modal controls
        document.getElementById('fullscreenPrevBtn').addEventListener('click', () => {
            previousSlide();
            updateFullscreenImage();
        });

        document.getElementById('fullscreenNextBtn').addEventListener('click', () => {
            nextSlide();
            updateFullscreenImage();
        });

        document.getElementById('fullscreenPlayPauseBtn').addEventListener('click', toggleSlideshow);

        // Keyboard navigation
        document.addEventListener('keydown', handleKeyboardNavigation);

        // Touch/swipe support
        setupTouchSupport();
    }

    // Go to Specific Slide
    function goToSlide(index) {
        if (index < 0 || index >= totalSlides) return;

        // Remove active class from current slide and thumbnail
        document.querySelector('.slide.active').classList.remove('active');
        document.querySelector('.thumbnail.active').classList.remove('active');

        // Add active class to new slide and thumbnail
        document.querySelector(`.slide[data-index="${index}"]`).classList.add('active');
        document.querySelector(`.thumbnail[data-index="${index}"]`).classList.add('active');

        currentSlideIndex = index;
        updateCounters();
    }

    // Next Slide
    function nextSlide() {
        const nextIndex = (currentSlideIndex + 1) % totalSlides;
        goToSlide(nextIndex);
    }

    // Previous Slide
    function previousSlide() {
        const prevIndex = currentSlideIndex === 0 ? totalSlides - 1 : currentSlideIndex - 1;
        goToSlide(prevIndex);
    }

    // Start Slideshow
    function startSlideshow() {
        if (slideshowInterval) clearInterval(slideshowInterval);

        slideshowInterval = setInterval(() => {
            if (isPlaying) {
                nextSlide();
            }
        }, slideshowSpeed);
    }

    // Stop Slideshow
    function stopSlideshow() {
        if (slideshowInterval) {
            clearInterval(slideshowInterval);
            slideshowInterval = null;
        }
    }

    // Toggle Slideshow
    function toggleSlideshow() {
        isPlaying = !isPlaying;

        const playPauseBtn = document.getElementById('playPauseBtn');
        const fullscreenPlayPauseBtn = document.getElementById('fullscreenPlayPauseBtn');

        if (isPlaying) {
            playPauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
            fullscreenPlayPauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
            startSlideshow();
        } else {
            playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
            fullscreenPlayPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
            stopSlideshow();
        }
    }

    // Update Counters
    function updateCounters() {
        document.getElementById('currentImage').textContent = currentSlideIndex + 1;
        document.getElementById('totalImages').textContent = totalSlides;
        document.getElementById('fullscreenCurrentImage').textContent = currentSlideIndex + 1;
        document.getElementById('fullscreenTotalImages').textContent = totalSlides;
    }

    // Reset Slideshow
    function resetSlideshow() {
        currentSlideIndex = 0;
        totalSlides = 0;
        isPlaying = true;
        stopSlideshow();
    }

    // Open Fullscreen
    function openFullscreen() {
        const fullscreenModal = new bootstrap.Modal(document.getElementById('fullscreenSlideshowModal'));
        fullscreenModal.show();
        updateFullscreenImage();
    }

    // Update Fullscreen Image
    function updateFullscreenImage() {
        if (!currentVehicleData || !currentVehicleData.images || currentVehicleData.images.length === 0) return;

        const currentImage = currentVehicleData.images[currentSlideIndex];
        const fullscreenImage = document.getElementById('fullscreenImage');

        // Fix URL to use correct server address
        let imageUrl = currentImage.image_url || '/assets/images/placeholder-vehicle.svg';
        if (imageUrl.includes('localhost')) {
            imageUrl = imageUrl.replace('http://localhost', 'http://127.0.0.1:8000');
        }
        fullscreenImage.src = imageUrl;
        fullscreenImage.alt = `Vehicle image ${currentSlideIndex + 1}`;

        // Add error handling for image loading
        fullscreenImage.onerror = function () {
            this.src = '/assets/images/placeholder-vehicle.svg';
            console.warn('Failed to load fullscreen image:', imageUrl);
        };
    }

    // Handle Keyboard Navigation
    function handleKeyboardNavigation(event) {
        const quickViewModal = document.getElementById('QuickViewModal');
        const fullscreenModal = document.getElementById('fullscreenSlideshowModal');

        if (!quickViewModal.classList.contains('show') && !fullscreenModal.classList.contains('show')) return;

        switch (event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                previousSlide();
                if (fullscreenModal.classList.contains('show')) {
                    updateFullscreenImage();
                }
                break;
            case 'ArrowRight':
                event.preventDefault();
                nextSlide();
                if (fullscreenModal.classList.contains('show')) {
                    updateFullscreenImage();
                }
                break;
            case ' ':
                event.preventDefault();
                toggleSlideshow();
                break;
            case 'Escape':
                if (fullscreenModal.classList.contains('show')) {
                    bootstrap.Modal.getInstance(fullscreenModal).hide();
                }
                break;
        }
    }

    // Setup Touch Support
    function setupTouchSupport() {
        const slideshowContainer = document.getElementById('slideshowContainer');
        let startX = 0;
        let endX = 0;

        slideshowContainer.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
        });

        slideshowContainer.addEventListener('touchend', (e) => {
            endX = e.changedTouches[0].clientX;
            handleSwipe();
        });

        function handleSwipe() {
            const swipeThreshold = 50;
            const diff = startX - endX;

            if (Math.abs(diff) > swipeThreshold) {
                if (diff > 0) {
                    // Swipe left - next slide
                    nextSlide();
                } else {
                    // Swipe right - previous slide
                    previousSlide();
                }
            }
        }
    }

    // Pause slideshow on hover
    const slideshowContainer = document.getElementById('slideshowContainer');
    if (slideshowContainer) {
        slideshowContainer.addEventListener('mouseenter', () => {
            if (isPlaying) {
                stopSlideshow();
            }
        });

        slideshowContainer.addEventListener('mouseleave', () => {
            if (isPlaying) {
                startSlideshow();
            }
        });
    }
});
