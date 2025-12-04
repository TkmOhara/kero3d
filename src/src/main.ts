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

// Try to load GLTF model
loader.load(
  import.meta.env.BASE_URL + 'models/character.glb',
  (gltf) => {
    characterContainer.remove(placeholder)
    characterModel = gltf.scene
    characterModel.scale.set(2, 2, 2)
    characterModel.rotation.y = Math.PI / 2 // Face forward (model's initial orientation fix)

    // Calculate bounding box and adjust Y position to stand on ground
    const box = new THREE.Box3().setFromObject(characterModel)
    characterModel.position.y = -box.min.y

    characterModel.castShadow = true
    characterModel.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
      }
    })
    characterContainer.add(characterModel)

    // Setup animations
    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(characterModel)
      gltf.animations.forEach((clip) => {
        const action = mixer!.clipAction(clip)
        actions[clip.name.toLowerCase()] = action
      })
      // Play idle animation if available
      if (actions['idle']) {
        currentAction = actions['idle']
        currentAction.play()
      }
    }
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
})

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase()
  if (key in keys) keys[key as keyof typeof keys] = false
})

// Animation helper
function playAnimation(name: string) {
  if (!mixer || !actions[name] || currentAction === actions[name]) return

  const newAction = actions[name]
  if (currentAction) {
    currentAction.fadeOut(0.2)
  }
  newAction.reset().fadeIn(0.2).play()
  currentAction = newAction
}

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

  // Play walk or idle animation
  if (mixer) {
    if (isMoving && actions['walk']) {
      playAnimation('walk')
    } else if (!isMoving && actions['idle']) {
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
