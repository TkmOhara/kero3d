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

// Health system
let playerHealth = 100
const maxHealth = 100
let gameOver = false
let damageFlashDuration = 0
const damageFlashMaxDuration = 0.3

// Enemy system
interface Enemy {
  container: THREE.Group
  health: number
  maxHealth: number
  punchCooldown: number
  lastPunchTime: number
  targetDirection: THREE.Vector3
  model: THREE.Object3D | null
  mixer: THREE.AnimationMixer | null
  actions: { [key: string]: THREE.AnimationAction }
  currentAction: THREE.AnimationAction | null
  isAttacking: boolean
  punchAnimationDuration: number
  punchHitTiming: number
  punchHitCooldown: number
}

const enemies: Enemy[] = []
// Combat constants
const punchRange = 3
const punchDamage = 10

// Enemy combat settings
const enemyPunchDamage = 10  // Significantly reduced damage
const enemyMinAttackInterval = 8.0  // Minimum 8 seconds between attacks for better game balance

const playerCollisionRadius = 0.8
const enemyCollisionRadius = 0.8
const minEnemyPlayerDistance = playerCollisionRadius + enemyCollisionRadius

// Camera offset for third-person view
const cameraOffset = new THREE.Vector3(0, 3, 6)

// Load character model
const loader = new GLTFLoader()

// Audio for enemy attacks
let hiroshimaAudio: HTMLAudioElement | null = null

function loadAttackSound() {
  hiroshimaAudio = new Audio(import.meta.env.BASE_URL + 'sounds/hiroshima.mp3')
  hiroshimaAudio.volume = 0.3
}

function playAttackSound() {
  if (hiroshimaAudio) {
    hiroshimaAudio.currentTime = 0
    hiroshimaAudio.play().catch(() => {
      console.log('Audio playback failed or was interrupted')
    })
  }
}

loadAttackSound()

// Function to create an enemy AI character
function createEnemy(x: number, z: number): Enemy {
  const container = new THREE.Group()
  container.position.set(x, 0, z)
  scene.add(container)

  // Placeholder for enemy (box until model is loaded)
  const enemyGeometry = new THREE.BoxGeometry(0.5, 1.5, 0.5)
  const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b6b })
  const enemyMesh = new THREE.Mesh(enemyGeometry, enemyMaterial)
  enemyMesh.position.y = 0.75
  enemyMesh.castShadow = true
  container.add(enemyMesh)

  const enemy: Enemy = {
    container,
    health: 100,
    maxHealth: 100,
    punchCooldown: 0,
    lastPunchTime: 0,
    targetDirection: new THREE.Vector3(),
    model: null,
    mixer: null,
    actions: {},
    currentAction: null,
    isAttacking: false,
    punchAnimationDuration: 0.6,
    punchHitTiming: 0.3,
    punchHitCooldown: 0
  }

  enemies.push(enemy)
  
  // Load character model for enemy
  loader.load(
    import.meta.env.BASE_URL + 'models/character.glb',
    (gltf) => {
      container.remove(enemyMesh)
      const enemyModel = gltf.scene
      enemyModel.scale.set(1, 1, 1)
      enemyModel.rotation.y = 0
      
      const box = new THREE.Box3().setFromObject(enemyModel)
      const groundOffset = -box.min.y * enemyModel.scale.y - 1
      enemyModel.position.y = groundOffset
      
      enemyModel.castShadow = true
      enemyModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true
        }
      })
      container.add(enemyModel)
      
      // Setup animation mixer for enemy
      enemy.model = enemyModel
      enemy.mixer = new THREE.AnimationMixer(enemyModel)
      
      // Load animations for enemy
      loadEnemyAnimations(enemy)
    },
    undefined,
    () => {
      console.log('Failed to load enemy model, using placeholder')
    }
  )
  
  return enemy
}

// Function to load animations for enemy
async function loadEnemyAnimations(enemy: Enemy) {
  if (!enemy.mixer || !enemy.model) return

  const animationFiles = [
    { name: 'idle', file: 'idle.glb' },
    { name: 'run', file: 'running.glb' },
    { name: 'punch', file: 'punching.glb' }
  ]

  for (const anim of animationFiles) {
    try {
      const gltf = await loader.loadAsync(import.meta.env.BASE_URL + 'models/' + anim.file)
      if (gltf.animations.length > 0) {
        const clip = gltf.animations[0]
        clip.name = anim.name
        const action = enemy.mixer!.clipAction(clip)
        enemy.actions[anim.name] = action
        
        // Record punch animation duration
        if (anim.name === 'punch') {
          enemy.punchAnimationDuration = clip.duration
          enemy.punchHitTiming = clip.duration * 0.5 // Hit at middle of animation
        }
        
        console.log(`Enemy animation loaded: ${anim.name} (duration: ${clip.duration.toFixed(2)}s)`)
      }
    } catch (e) {
      console.error(`Failed to load enemy animation: ${anim.file}`, e)
    }
  }

  // Start with idle animation
  if (enemy.actions['idle']) {
    playEnemyAnimation(enemy, 'idle')
  }
}

// Function to play animation for enemy
function playEnemyAnimation(enemy: Enemy, name: string, loop: boolean = true) {
  if (!enemy.mixer || !enemy.actions[name]) return

  const newAction = enemy.actions[name]

  if (enemy.currentAction === newAction && newAction.isRunning()) return

  if (enemy.currentAction) {
    enemy.currentAction.fadeOut(0.2)
  }

  newAction.reset()
  newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
  newAction.clampWhenFinished = !loop
  newAction.fadeIn(0.2)
  newAction.play()

  enemy.currentAction = newAction
}

// Create 3 enemy AI characters
createEnemy(-15, 20)
createEnemy(25, -20)
createEnemy(10, 25)

// Function to update enemy AI
function updateEnemies(delta: number) {
  enemies.forEach((enemy, index) => {
    if (enemy.health <= 0) {
      scene.remove(enemy.container)
      enemies.splice(index, 1)
      return
    }

    // Update mixer
    if (enemy.mixer) {
      enemy.mixer.update(delta)
    }

    // Calculate distance to player
    const distanceToPlayer = characterContainer.position.distanceTo(enemy.container.position)
    
    // Enemy AI behavior
    if (distanceToPlayer < 30) {
      // Move towards player only if not attacking
      if (!enemy.isAttacking) {
        const direction = new THREE.Vector3()
          .subVectors(characterContainer.position, enemy.container.position)
          .normalize()
        
        // Apply collision detection - prevent enemy from overlapping with player
        const nextPosition = enemy.container.position.clone().add(direction.multiplyScalar(3 * delta))
        const nextDistance = characterContainer.position.distanceTo(nextPosition)
        
        if (nextDistance > minEnemyPlayerDistance) {
          enemy.container.position.copy(nextPosition)
        } else {
          // Stop moving if too close
          enemy.container.position.lerp(characterContainer.position, 0.01)
        }

        // Face the player - rotate container instead of using lookAt
        const angle = Math.atan2(direction.x, direction.z)
        enemy.container.rotation.y = angle

        // Play run animation if not attacking
        if (enemy.actions['run']) {
          playEnemyAnimation(enemy, 'run')
        }
      }

      // Attack if close enough
      enemy.punchCooldown -= delta
      
      if (distanceToPlayer < punchRange && enemy.punchCooldown <= 0 && !enemy.isAttacking) {
        enemy.isAttacking = true
        enemy.punchHitCooldown = enemy.punchHitTiming
        // Total cooldown: animation duration + base cooldown + random variation
        enemy.punchCooldown = enemy.punchAnimationDuration + enemyMinAttackInterval
        console.log(`Enemy starts punch! Next attack in ${(enemy.punchCooldown).toFixed(2)}s`)
        
        // Play punch animation
        if (enemy.actions['punch']) {
          playEnemyAnimation(enemy, 'punch', false)
        }
        
        // Play attack sound
        playAttackSound()
      }
      
      // Deal damage at the right timing during punch animation
      if (enemy.isAttacking && enemy.punchHitCooldown > 0) {
        enemy.punchHitCooldown -= delta
        
        // Trigger damage when hit timing is reached
        if (enemy.punchHitCooldown <= 0 && distanceToPlayer < punchRange) {
          playerHealth -= enemyPunchDamage
          damageFlashDuration = damageFlashMaxDuration
          console.log(`Enemy hit! Player health: ${playerHealth}`)
          
          if (playerHealth <= 0) {
            gameOver = true
            console.log('Game Over! You were defeated!')
            showGameOverScreen()
          }
        }
      }
      
      // Return to idle after punch animation finishes
      if (enemy.isAttacking && enemy.punchCooldown <= enemyMinAttackInterval) {
        enemy.isAttacking = false
        if (enemy.actions['idle']) {
          playEnemyAnimation(enemy, 'idle')
        }
      }
    } else {
      // Play idle animation when far from player
      if (enemy.actions['idle'] && !enemy.isAttacking) {
        playEnemyAnimation(enemy, 'idle')
      }
    }
  })
}

// Function to check punch collision with enemies
function handlePunchAttack() {
  if (!isPunching) return

  enemies.forEach((enemy) => {
    const distanceToEnemy = characterContainer.position.distanceTo(enemy.container.position)
    
    // Check if enemy is in front of player and within punch range
    if (distanceToEnemy < punchRange) {
      const directionToEnemy = new THREE.Vector3()
        .subVectors(enemy.container.position, characterContainer.position)
        .normalize()
      
      const facingDirection = new THREE.Vector3(0, 0, -1)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), characterContainer.rotation.y)
      
      // Check if enemy is roughly in front (dot product > 0.3)
      if (directionToEnemy.dot(facingDirection) > 0.3) {
        enemy.health -= punchDamage
        console.log(`Hit enemy! Enemy health: ${enemy.health}`)
        
        if (enemy.health <= 0) {
          console.log('Enemy defeated!')
          // Enemy will be removed in updateEnemies
        }
      }
    }
  })
}

// Function to show game over screen
function showGameOverScreen() {
  const overlay = document.createElement('div')
  overlay.style.position = 'fixed'
  overlay.style.top = '0'
  overlay.style.left = '0'
  overlay.style.width = '100%'
  overlay.style.height = '100%'
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'
  overlay.style.display = 'flex'
  overlay.style.flexDirection = 'column'
  overlay.style.justifyContent = 'center'
  overlay.style.alignItems = 'center'
  overlay.style.zIndex = '9999'
  overlay.style.pointerEvents = 'auto'

  const gameOverText = document.createElement('div')
  gameOverText.style.color = 'white'
  gameOverText.style.fontSize = '48px'
  gameOverText.style.fontWeight = 'bold'
  gameOverText.style.marginBottom = '40px'
  gameOverText.textContent = 'GAME OVER'

  const retryButton = document.createElement('button')
  retryButton.textContent = 'RETRY'
  retryButton.style.padding = '15px 40px'
  retryButton.style.fontSize = '24px'
  retryButton.style.fontWeight = 'bold'
  retryButton.style.color = 'white'
  retryButton.style.backgroundColor = '#ff6b6b'
  retryButton.style.border = 'none'
  retryButton.style.borderRadius = '5px'
  retryButton.style.cursor = 'pointer'
  retryButton.style.transition = 'background-color 0.3s'
  retryButton.style.pointerEvents = 'auto'
  
  retryButton.addEventListener('mouseover', () => {
    retryButton.style.backgroundColor = '#ff8787'
  })
  
  retryButton.addEventListener('mouseout', () => {
    retryButton.style.backgroundColor = '#ff6b6b'
  })
  
  retryButton.addEventListener('click', () => {
    window.location.reload()
  })

  overlay.appendChild(gameOverText)
  overlay.appendChild(retryButton)
  document.body.appendChild(overlay)
}

// Function to display HUD with health
function updateHUD() {
  let hud = document.getElementById('hud')
  if (!hud) {
    hud = document.createElement('div')
    hud.id = 'hud'
    hud.style.position = 'fixed'
    hud.style.top = '10px'
    hud.style.left = '10px'
    hud.style.color = 'white'
    hud.style.fontSize = '20px'
    hud.style.fontFamily = 'Arial, sans-serif'
    hud.style.zIndex = '1000'
    document.body.appendChild(hud)
  }

  const healthPercentage = (playerHealth / maxHealth) * 100
  const healthColor = healthPercentage > 50 ? '#00ff00' : healthPercentage > 25 ? '#ffaa00' : '#ff0000'
  
  hud.innerHTML = `
    <div>Health: <span style="color: ${healthColor}">${Math.max(0, playerHealth)}</span>/${maxHealth}</div>
    <div>Enemies: ${enemies.length}</div>
  `
}

// Function to update damage flash effect
function updateDamageFlash() {
  let damageOverlay = document.getElementById('damage-flash')
  if (damageFlashDuration > 0) {
    if (!damageOverlay) {
      damageOverlay = document.createElement('div')
      damageOverlay.id = 'damage-flash'
      damageOverlay.style.position = 'fixed'
      damageOverlay.style.top = '0'
      damageOverlay.style.left = '0'
      damageOverlay.style.width = '100%'
      damageOverlay.style.height = '100%'
      damageOverlay.style.pointerEvents = 'none'
      damageOverlay.style.zIndex = '500'
      document.body.appendChild(damageOverlay)
    }
    
    const opacity = damageFlashDuration / damageFlashMaxDuration
    damageOverlay.style.backgroundColor = `rgba(255, 0, 0, ${opacity * 0.5})`
    damageFlashDuration -= 0.016 // roughly 60fps
  } else if (damageOverlay) {
    damageOverlay.remove()
  }
}

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
  if (e.button === 0 && !isPunching && !isJumping && !gameOver) { // Left click
    isPunching = true
    playAnimation('punch', false)
    handlePunchAttack()
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
  updateEnemies(delta)
  updateHUD()
  updateDamageFlash()
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