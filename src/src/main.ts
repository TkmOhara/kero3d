import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import './style.css'

// Scene
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87ceeb)

// Camera
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
)

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
renderer.shadowMap.enabled = true
document.getElementById('app')!.appendChild(renderer.domElement)

// OrbitControls (will be updated to follow character)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.maxPolarAngle = Math.PI / 2.1

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
directionalLight.position.set(10, 20, 10)
directionalLight.castShadow = true
directionalLight.shadow.mapSize.width = 2048
directionalLight.shadow.mapSize.height = 2048
scene.add(directionalLight)

// Ground
const groundGeometry = new THREE.PlaneGeometry(100, 100)
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x3d9140 })
const ground = new THREE.Mesh(groundGeometry, groundMaterial)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

// Grid helper
const grid = new THREE.GridHelper(100, 100, 0x000000, 0x000000)
grid.material.opacity = 0.1
grid.material.transparent = true
scene.add(grid)

// Character container (for movement/rotation) and model (for animations)
const characterContainer = new THREE.Group()
scene.add(characterContainer)

let characterModel: THREE.Object3D | null = null
let mixer: THREE.AnimationMixer | null = null
let actions: { [key: string]: THREE.AnimationAction } = {}
let currentAction: THREE.AnimationAction | null = null

const moveSpeed = 5
const rotateSpeed = 3
const keys = { w: false, a: false, s: false, d: false }

// Jump state
let isJumping = false
let velocityY = 0
const gravity = -20
const jumpForce = 8

// Punch state
let isPunching = false

// Camera offset for third-person view
const cameraOffset = new THREE.Vector3(0, 3, 6)

// Load character model
const loader = new GLTFLoader()

// Placeholder character (box) until model is loaded
const placeholderGeometry = new THREE.BoxGeometry(0.5, 1.5, 0.5)
const placeholderMaterial = new THREE.MeshStandardMaterial({ color: 0x4fc3f7 })
const placeholder = new THREE.Mesh(placeholderGeometry, placeholderMaterial)
placeholder.position.y = 0.75
placeholder.castShadow = true
characterContainer.add(placeholder)

// Function to play animation with crossfade
function playAnimation(name: string, loop: boolean = true) {
  if (!mixer || !actions[name]) {
    console.warn(`Animation not available: ${name}`)
    return
  }

  const newAction = actions[name]

  if (currentAction === newAction && newAction.isRunning()) return

  if (currentAction) {
    currentAction.fadeOut(0.2)
  }

  newAction.reset()
  newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
  newAction.clampWhenFinished = !loop
  newAction.fadeIn(0.2)
  newAction.play()

  currentAction = newAction
  console.log(`Playing: ${name}`)
}

// Load all animations after model is loaded
async function loadAnimations() {
  if (!mixer || !characterModel) return

  // Log character's bone structure for debugging
  console.log('=== Character bone structure ===')
  const boneNames: string[] = []
  characterModel.traverse((child) => {
    if (child instanceof THREE.Bone || child.type === 'Bone') {
      boneNames.push(child.name)
    }
  })
  console.log('Bones:', boneNames.slice(0, 5).join(', '), '...')

  const animationFiles = [
    { name: 'idle', file: 'idle.glb' },
    { name: 'run', file: 'running.glb' },
    { name: 'jump', file: 'jump.glb' },
    { name: 'punch', file: 'punching.glb' }
  ]

  for (const anim of animationFiles) {
    try {
      const gltf = await loader.loadAsync(import.meta.env.BASE_URL + 'models/' + anim.file)
      if (gltf.animations.length > 0) {
        const clip = gltf.animations[0]

        // Log first track to see the format
        if (clip.tracks.length > 0) {
          console.log(`${anim.name} first track: "${clip.tracks[0].name}"`)
        }

        // Use clip directly without retargeting (names should already match)
        clip.name = anim.name
        const action = mixer.clipAction(clip)
        actions[anim.name] = action
        console.log(`Animation loaded: ${anim.name} (${clip.tracks.length} tracks, ${clip.duration.toFixed(2)}s)`)
      }
    } catch (e) {
      console.error(`Failed to load animation: ${anim.file}`, e)
    }
  }

  console.log('All available actions:', Object.keys(actions))

  // Verify mixer can find bones
  const testBone = characterModel.getObjectByName('mixamorigHips')
  console.log(`Can find mixamorigHips by name: ${testBone ? 'YES' : 'NO'}`)
  if (testBone) {
    console.log(`Bone type: ${testBone.type}, parent: ${testBone.parent?.name}`)
  }

  // Start with idle animation
  if (actions['idle']) {
    playAnimation('idle')
  }
}

// Try to load GLTF model
loader.load(
  import.meta.env.BASE_URL + 'models/character.glb',
  (gltf) => {
    characterContainer.remove(placeholder)
    characterModel = gltf.scene
    characterModel.scale.set(1, 1, 1) // Smaller scale
    characterModel.rotation.y = Math.PI // Face forward (model's initial orientation fix)

    // Calculate bounding box and adjust Y position to stand on ground
    const box = new THREE.Box3().setFromObject(characterModel)
    const groundOffset = -box.min.y * characterModel.scale.y - 1 // Lower to ground
    characterModel.position.y = groundOffset

    characterModel.castShadow = true
    characterModel.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
      }
    })
    characterContainer.add(characterModel)

    // Setup mixer for animations - use the whole model as root
    // The mixer will search for bones by name in the hierarchy
    mixer = new THREE.AnimationMixer(characterModel)

    // Log the hierarchy for debugging
    console.log('=== Model hierarchy ===')
    characterModel.traverse((child) => {
      console.log(`${child.type}: ${child.name}`)
    })

    // Listen for animation finished events
    mixer.addEventListener('finished', (e) => {
      const finishedAction = e.action
      if (finishedAction === actions['jump']) {
        isJumping = false
        // Return to idle or run based on movement
        if (keys.w || keys.s) {
          playAnimation('run')
        } else {
          playAnimation('idle')
        }
      }
      if (finishedAction === actions['punch']) {
        isPunching = false
        // Return to idle or run based on movement
        if (keys.w || keys.s) {
          playAnimation('run')
        } else {
          playAnimation('idle')
        }
      }
    })

    // Load all animations
    loadAnimations()

    console.log('Model loaded successfully')
  },
  undefined,
  () => {
    console.log('No character model found, using placeholder. Place your model at public/models/character.glb')
  }
)

// Keyboard input
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  if (key in keys) keys[key as keyof typeof keys] = true

  // Jump on space
  if (e.code === 'Space' && !isJumping && !isPunching) {
    isJumping = true
    velocityY = jumpForce
    playAnimation('jump', false)
  }
})

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase()
  if (key in keys) keys[key as keyof typeof keys] = false
})

// Mouse click for punching
window.addEventListener('mousedown', (e) => {
  if (e.button === 0 && !isPunching && !isJumping) { // Left click
    isPunching = true
    playAnimation('punch', false)
  }
})

// Update character movement
function updateCharacter(delta: number) {
  const moveDirection = new THREE.Vector3()
  let isMoving = false

  if (keys.w) { moveDirection.z -= 1; isMoving = true }
  if (keys.s) { moveDirection.z += 1; isMoving = true }
  if (keys.a) { characterContainer.rotation.y += rotateSpeed * delta }
  if (keys.d) { characterContainer.rotation.y -= rotateSpeed * delta }

  if (moveDirection.length() > 0) {
    moveDirection.normalize()
    moveDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), characterContainer.rotation.y)
    characterContainer.position.add(moveDirection.multiplyScalar(moveSpeed * delta))
  }

  // Jump physics - always apply if character is above ground or has velocity
  if (isJumping || characterContainer.position.y > 0) {
    velocityY += gravity * delta
    characterContainer.position.y += velocityY * delta

    // Check if landed
    if (characterContainer.position.y <= 0) {
      characterContainer.position.y = 0
      velocityY = 0
      isJumping = false
    }
  }

  // Play animations based on state (only if not jumping or punching)
  if (mixer && !isJumping && !isPunching) {
    if (isMoving && currentAction !== actions['run']) {
      playAnimation('run')
    } else if (!isMoving && currentAction !== actions['idle']) {
      playAnimation('idle')
    }
  }
}

// Update camera to follow character
function updateCamera() {
  const offset = cameraOffset.clone()
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), characterContainer.rotation.y)

  const targetPosition = characterContainer.position.clone().add(offset)
  camera.position.lerp(targetPosition, 0.1)

  const lookTarget = characterContainer.position.clone()
  lookTarget.y += 1.5
  controls.target.lerp(lookTarget, 0.1)
}

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// Clock for delta time
const clock = new THREE.Clock()

// Animation loop
function animate() {
  const delta = clock.getDelta()

  updateCharacter(delta)
  updateCamera()

  if (mixer) mixer.update(delta)
  controls.update()

  renderer.render(scene, camera)
}

renderer.setAnimationLoop(animate)

// Initial camera position
camera.position.set(0, 3, 6)
controls.target.set(0, 1.5, 0)

// Debug info
console.log('Controls: W/S = move, A/D = rotate, Space = jump, Left Click = punch')
console.log('Check console for animation debugging info')
