/**
 * Home Pets Grid – 5-column grid using ORIGINAL pet nodes
 * so Neopets' native onclick / checkActivePet runs at full speed.
 * Page: https://www.neopets.com/home*
 */
(function () {
  'use strict';

  function isHomePage() {
    const path = (location.pathname || '').toLowerCase();
    return path === '/home' || path === '/home/' || path.indexOf('/home/') === 0 ||
           /\/home\.phtml/i.test(path) ||
           (path === '/' && /neopets\.com\/?$/i.test(location.href));
  }

  function injectStyles() {
    if (document.getElementById('darthy-home-pets-css')) return;
    const style = document.createElement('style');
    style.id = 'darthy-home-pets-css';
    style.textContent = `
      #darthy-home-pets-grid.darthy-home-pets-grid {
        display: grid !important;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 20px 12px;
        width: 100%;
        max-width: 920px;
        margin: 10px auto 20px;
        padding: 10px 8px 16px;
        box-sizing: border-box;
        justify-items: center;
        align-items: start;
      }
      #darthy-home-pets-grid .darthy-home-pet-cell {
        display: flex !important;
        flex-direction: column;
        align-items: center;
        width: 100%;
        max-width: 155px;
        margin: 0 auto;
        box-sizing: border-box;
      }
      #darthy-home-pets-grid .hp-carousel-pet-container {
        display: flex !important;
        flex-direction: column;
        align-items: center;
        width: 100%;
        max-width: 155px;
        margin: 0 auto !important;
        float: none !important;
        position: static !important;
        transform: none !important;
      }
      #darthy-home-pets-grid .hp-carousel-pet-offset {
        display: none !important;
      }
      #darthy-home-pets-grid .hp-carousel-pet {
        width: 100% !important;
        max-width: 130px !important;
        height: 0 !important;
        padding-bottom: 100% !important;
        background-size: contain !important;
        background-repeat: no-repeat !important;
        background-position: center bottom !important;
        margin: 0 auto !important;
        cursor: pointer;
      }
      #darthy-home-pets-grid .hp-carousel-pet[data-active="true"] {
        outline: 3px solid #f5c542;
        outline-offset: 3px;
        border-radius: 8px;
      }
      #darthy-home-pets-grid .hp-carousel-nameplate {
        width: 100% !important;
        max-width: 155px !important;
        margin-top: 3px !important;
        margin-bottom: 0 !important;
        font-size: 24px !important;
        line-height: 1.15 !important;
        padding: 12px 12px !important;
        min-height: 52px !important;
        text-align: center !important;
        box-sizing: border-box !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex !important;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      #darthy-home-pets-grid .hp-carousel-addpet {
        width: 100% !important;
        max-width: 130px !important;
        min-height: 130px !important;
        height: 130px !important;
        margin: 0 auto !important;
        background-size: contain !important;
        background-repeat: no-repeat !important;
        background-position: center !important;
        cursor: pointer;
      }
      /* Hide slick chrome; keep track in DOM but invisible */
      .hp-carousel-container .slick-arrow,
      .hp-slick__2020 .slick-prev,
      .hp-slick__2020 .slick-next {
        display: none !important;
      }
      .hp-slick__2020.darthy-slick-hidden {
        height: 0 !important;
        overflow: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      @media (max-width: 720px) {
        #darthy-home-pets-grid.darthy-home-pets-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          max-width: 100%;
        }
        #darthy-home-pets-grid .hp-carousel-nameplate {
          font-size: 18px !important;
          min-height: 42px !important;
          padding: 10px !important;
        }
      }
      @media (max-width: 420px) {
        #darthy-home-pets-grid.darthy-home-pets-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        #darthy-home-pets-grid .hp-carousel-nameplate {
          font-size: 16px !important;
          min-height: 38px !important;
          padding: 8px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Collect unique original pet containers (not slick clones, not already in our grid).
   * Prefer the non-cloned slick slide when available.
   */
  function collectOriginalContainers() {
    const byName = new Map(); // name -> { container, isAdd }
    const addContainers = [];

    document.querySelectorAll('.hp-carousel-pet-container').forEach(container => {
      if (container.closest('#darthy-home-pets-grid')) return;

      const addPet = container.querySelector('.hp-carousel-addpet');
      if (addPet) {
        addContainers.push(container);
        return;
      }

      const pet = container.querySelector('.hp-carousel-pet[data-name]');
      if (!pet) return;
      const name = pet.getAttribute('data-name');
      if (!name) return;

      const slide = container.closest('.slick-slide');
      const isClone = !!(slide && slide.classList.contains('slick-cloned'));

      const prev = byName.get(name);
      if (!prev) {
        byName.set(name, { container, isClone });
      } else if (prev.isClone && !isClone) {
        // Prefer real slide over clone
        byName.set(name, { container, isClone });
      }
    });

    const pets = Array.from(byName.values()).map(v => v.container);
    // One add-pet tile
    const add = addContainers.find(c => {
      const slide = c.closest('.slick-slide');
      return !(slide && slide.classList.contains('slick-cloned'));
    }) || addContainers[0] || null;

    return { pets, add };
  }

  function applyGrid() {
    if (document.getElementById('darthy-home-pets-grid')) return true;

    const pageContainer =
      document.querySelector('.hp-carousel-container') ||
      (document.querySelector('.hp-slick__2020') && document.querySelector('.hp-slick__2020').parentElement);
    if (!pageContainer) return false;

    const { pets, add } = collectOriginalContainers();
    if (!pets.length) return false;

    injectStyles();

    // Hide slick UI (keep nodes in DOM until we move them)
    const slick = pageContainer.querySelector('.hp-slick__2020, .slick-initialized');
    if (slick) slick.classList.add('darthy-slick-hidden');
    pageContainer.querySelectorAll('.slick-arrow, .slick-prev, .slick-next').forEach(b => {
      b.style.display = 'none';
    });

    const grid = document.createElement('div');
    grid.id = 'darthy-home-pets-grid';
    grid.className = 'darthy-home-pets-grid';

    // Move ORIGINAL containers into grid — native onclick stays intact (instant)
    pets.forEach(container => {
      const cell = document.createElement('div');
      cell.className = 'darthy-home-pet-cell';
      // Detach from slick slide and place in grid
      cell.appendChild(container);
      grid.appendChild(cell);
    });

    if (add) {
      const cell = document.createElement('div');
      cell.className = 'darthy-home-pet-cell darthy-home-add-cell';
      cell.appendChild(add);
      grid.appendChild(cell);
    }

    pageContainer.appendChild(grid);

    console.log('%c[DarthyPrime Home] Grid with ' + pets.length + ' original pet nodes (native click)', 'color:#7dd3fc;font-weight:bold');
    return true;
  }

  window.DarthyPrimeHomePets = {
    init: function () {
      if (!isHomePage() && !document.querySelector('.hp-carousel-container')) return;

      let tries = 0;
      const tick = () => {
        if (applyGrid()) return;
        tries++;
        if (tries < 30) setTimeout(tick, 350);
      };
      tick();

      const obs = new MutationObserver(() => {
        if (!document.getElementById('darthy-home-pets-grid')) applyGrid();
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => obs.disconnect(), 14000);
    }
  };
})();
