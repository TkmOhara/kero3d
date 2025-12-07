import './style.css';
import init, { start, update_joystick, update_buttons } from './pkg/kero_bevy.js';

async function main() {
  console.log("Initializing Bevy App...");
  const loadingOverlay = document.getElementById('loading-overlay');

  try {
    await init();
    setupMobileControls();

    // start() may throw a winit "exception" that's actually just control flow
    // We catch it but still proceed to hide the overlay
    try {
      start();
    } catch (winitError: unknown) {
      // winit uses exceptions for control flow on web, this is expected
      const errorMessage = winitError instanceof Error ? winitError.message : String(winitError);
      if (errorMessage.includes("Using exceptions for control flow")) {
        console.log("Bevy App running (ignoring winit control flow)");
      } else {
        throw winitError; // Re-throw if it's a real error
      }
    }

    console.log("Bevy App Started.");

    // Hide loading overlay after a short delay to ensure first frame renders
    setTimeout(() => {
      if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
      }
    }, 1000);
  } catch (e) {
    console.error("Failed to start Bevy App:", e);
    if (loadingOverlay) {
      const content = loadingOverlay.querySelector('.loading-content');
      if (content) {
        content.innerHTML = '<p style="color: #ff6b6b;">Failed to load. Please refresh.</p>';
      }
    }
  }
}

function setupMobileControls() {
  const joystickZone = document.getElementById('joystick-zone');
  const joystickKnob = document.getElementById('joystick-knob');
  const jumpBtn = document.getElementById('btn-jump');
  const punchBtn = document.getElementById('btn-punch');

  if (!joystickZone || !joystickKnob || !jumpBtn || !punchBtn) {
    console.error("Mobile controls not found");
    return;
  }

  // Joystick Logic
  let isDragging = false;
  let joystickCenter = { x: 0, y: 0 };
  const maxRadius = 35; // Constrain knob movement

  function handleJoystickMove(touch: Touch) {
    if (!joystickKnob) return;
    const dx = touch.clientX - joystickCenter.x;
    const dy = touch.clientY - joystickCenter.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    let moveX = dx;
    let moveY = dy;

    if (distance > maxRadius) {
      const ratio = maxRadius / distance;
      moveX = dx * ratio;
      moveY = dy * ratio;
    }

    joystickKnob.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;
    update_joystick(moveX / maxRadius, moveY / maxRadius);
  }

  const endDrag = () => {
    isDragging = false;
    if (joystickKnob) {
      joystickKnob.style.transform = `translate(-50%, -50%)`;
    }
    update_joystick(0, 0);
  };

  joystickZone.addEventListener('touchstart', (e) => {
    isDragging = true;
    const rect = joystickZone.getBoundingClientRect();
    joystickCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
    handleJoystickMove(e.touches[0]);
  }, { passive: false });

  joystickZone.addEventListener('touchmove', (e) => {
    if (isDragging) {
      e.preventDefault(); // Prevent scroll
      handleJoystickMove(e.touches[0]);
    }
  }, { passive: false });

  joystickZone.addEventListener('touchend', endDrag);
  joystickZone.addEventListener('touchcancel', endDrag);

  // Button Logic
  jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); update_buttons(true, false); });
  jumpBtn.addEventListener('touchend', (e) => { e.preventDefault(); update_buttons(false, false); });

  punchBtn.addEventListener('touchstart', (e) => { e.preventDefault(); update_buttons(false, true); });
  punchBtn.addEventListener('touchend', (e) => { e.preventDefault(); update_buttons(false, false); });
}

main();