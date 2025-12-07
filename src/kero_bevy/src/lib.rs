use bevy::prelude::*;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn start() {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "Kero3D Bevy".to_string(),
                canvas: Some("#app-canvas".into()),
                fit_canvas_to_parent: true,
                prevent_default_event_handling: false,
                ..default()
            }),
            ..default()
        }).set(AssetPlugin {
            meta_check: bevy::asset::AssetMetaCheck::Never,
            ..default()
        }))
        .insert_resource(ClearColor(Color::srgb_u8(135, 206, 235))) // 0x87ceeb Sky Blue
        .init_resource::<MobileInput>()
        .add_systems(Startup, setup)
        .add_systems(Update, (animate_light_direction, sync_mobile_input, player_movement, enemy_behavior, link_animations, animate_fps_hands))
        .run();
}

#[derive(Component)]
struct FpsHand {
    side: HandSide,
    original_position: Vec3,
}

enum HandSide {
    Left,
    Right,
}


#[derive(Component)]
struct Player {
    speed: f32,
    state: PlayerState,
    animation_entity: Option<Entity>,
}

#[derive(Component)]
struct Enemy {
    speed: f32,
    state: PlayerState,
    animation_entity: Option<Entity>,
}

#[derive(Default, PartialEq, Eq, Clone, Copy, Debug)]
enum PlayerState {
    #[default]
    Idle,
    Running,
    Jumping,
    Punching,
}

#[derive(Resource, Default)]
struct MobileInput {
    joystick_x: f32,
    joystick_y: f32,
    jump: bool,
    punch: bool,
}

#[derive(Resource)]
#[allow(dead_code)]
struct AudioAssets {
    bgm: Handle<AudioSource>,
    punch: Handle<AudioSource>,
}

use std::sync::Mutex;
use std::sync::OnceLock;

static MOBILE_INPUT_STATE: OnceLock<Mutex<MobileInput>> = OnceLock::new();

fn get_mobile_input_state() -> &'static Mutex<MobileInput> {
    MOBILE_INPUT_STATE.get_or_init(|| Mutex::new(MobileInput::default()))
}

#[wasm_bindgen]
pub fn update_joystick(x: f32, y: f32) {
    if let Ok(mut state) = get_mobile_input_state().lock() {
        state.joystick_x = x;
        state.joystick_y = y;
    }
}

#[wasm_bindgen]
pub fn update_buttons(jump: bool, punch: bool) {
    if let Ok(mut state) = get_mobile_input_state().lock() {
        state.jump = jump;
        state.punch = punch;
    }
}

#[derive(Resource)]
struct Animations {
    graph: Handle<AnimationGraph>,
    idle: AnimationNodeIndex,
    run: AnimationNodeIndex,
    punch: AnimationNodeIndex,
    jump: AnimationNodeIndex,
}

fn setup(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
) {
    // Light
    commands.insert_resource(AmbientLight {
        color: Color::WHITE,
        brightness: 600.0,
    });

    commands.spawn(DirectionalLightBundle {
        directional_light: DirectionalLight {
            illuminance: 8000.0,
            shadows_enabled: true,
            ..default()
        },
        transform: Transform::from_xyz(10.0, 20.0, 10.0).looking_at(Vec3::ZERO, Vec3::Y),
        ..default()
    });

    // Ground
    commands.spawn(PbrBundle {
        mesh: meshes.add(Plane3d::default().mesh().size(100.0, 100.0)),
        material: materials.add(StandardMaterial {
            base_color: Color::srgb_u8(61, 145, 64),
            perceptual_roughness: 0.8,
            ..default()
        }),
        transform: Transform::from_rotation(Quat::from_rotation_x(0.0)),
        ..default()
    });

    // Audio
    let bgm = asset_server.load("sounds/music.mp3");
    let punch_sound = asset_server.load("sounds/punch.mp3");

    commands.insert_resource(AudioAssets {
        bgm: bgm.clone(),
        punch: punch_sound,
    });

    commands.spawn(AudioBundle {
        source: bgm,
        settings: PlaybackSettings::LOOP,
    });

    // Animations
    let mut graph = AnimationGraph::new();
    let idle = graph.add_clip(asset_server.load("models/idle.glb#Animation0"), 1.0, graph.root);
    let run = graph.add_clip(asset_server.load("models/running.glb#Animation0"), 1.0, graph.root);
    let punch = graph.add_clip(asset_server.load("models/punching.glb#Animation0"), 1.0, graph.root);
    let jump = graph.add_clip(asset_server.load("models/jump.glb#Animation0"), 1.0, graph.root);

    let graph_handle = graphs.add(graph);

    commands.insert_resource(Animations {
        graph: graph_handle,
        idle,
        run,
        punch,
        jump,
    });

    // Player
    commands.spawn((
        SceneBundle {
            scene: asset_server.load("models/character.glb#Scene0"),
            transform: Transform::from_xyz(0.0, 0.0, 0.0),
            ..default()
        },
        Player { 
            speed: 5.0,
            state: PlayerState::Idle,
            animation_entity: None, 
        },
    )).with_children(|parent| {
        // FPS Camera
        parent.spawn(Camera3dBundle {
            transform: Transform::from_xyz(0.0, 1.6, 0.2).looking_at(Vec3::new(0.0, 1.6, -1.0), Vec3::Y),
            ..default()
        }).with_children(|camera| {
             // Left Hand
            camera.spawn((
                PbrBundle {
                    mesh: meshes.add(Cuboid::new(0.1, 0.1, 0.25)),
                    material: materials.add(Color::srgb(0.8, 0.1, 0.1)),
                    transform: Transform::from_xyz(-0.25, -0.2, -0.4),
                    ..default()
                },
                FpsHand { side: HandSide::Left, original_position: Vec3::new(-0.25, -0.2, -0.4) }
            ));
            // Right Hand
            camera.spawn((
                PbrBundle {
                    mesh: meshes.add(Cuboid::new(0.1, 0.1, 0.25)),
                    material: materials.add(Color::srgb(0.8, 0.1, 0.1)),
                    transform: Transform::from_xyz(0.25, -0.2, -0.4),
                    ..default()
                },
                FpsHand { side: HandSide::Right, original_position: Vec3::new(0.25, -0.2, -0.4) }
            ));
        });
    });

    // Enemy
    commands.spawn((
        SceneBundle {
            scene: asset_server.load("models/character.glb#Scene0"),
            transform: Transform::from_xyz(5.0, 0.0, -5.0).with_rotation(Quat::from_rotation_y(3.14)), // Face player roughly
            ..default()
        },
        Enemy { 
            speed: 3.5,
            state: PlayerState::Idle,
            animation_entity: None, 
        },
    ));
}

fn animate_light_direction(
    _time: Res<Time>,
    mut _query: Query<&mut Transform, With<DirectionalLight>>,
) {
    // Optional
}

fn sync_mobile_input(mut input: ResMut<MobileInput>) {
    if let Ok(state) = get_mobile_input_state().lock() {
        input.joystick_x = state.joystick_x;
        input.joystick_y = state.joystick_y;
        input.jump = state.jump;
        input.punch = state.punch;
    }
}

fn link_animations(
    mut commands: Commands,
    mut player_query: Query<(Entity, &mut Player)>,
    mut enemy_query: Query<(Entity, &mut Enemy)>,
    parent_query: Query<&Parent>,
    animation_player_query: Query<Entity, Added<AnimationPlayer>>,
    animations: Res<Animations>,
) {
    for entity in animation_player_query.iter() {
        let mut ancestor = entity;
        commands.entity(entity).insert(animations.graph.clone());
        
        while let Ok(parent) = parent_query.get(ancestor) {
            ancestor = **parent;
            if let Ok((_, mut player)) = player_query.get_mut(ancestor) {
                player.animation_entity = Some(entity);
                break;
            }
            if let Ok((_, mut enemy)) = enemy_query.get_mut(ancestor) {
                enemy.animation_entity = Some(entity);
                break;
            }
        }
    }
}

fn enemy_behavior(
    time: Res<Time>,
    mut enemy_query: Query<(&mut Transform, &mut Enemy), Without<Player>>,
    player_query: Query<&Transform, With<Player>>,
    mut animation_players: Query<&mut AnimationPlayer>,
    animations: Res<Animations>,
) {
    let player_transform = if let Ok(t) = player_query.get_single() {
        t
    } else {
        return;
    };

    for (mut transform, mut enemy) in &mut enemy_query {
        let distance = transform.translation.distance(player_transform.translation);
        
        let chase_range = 15.0;
        let attack_range = 1.5;

        // State Transition
        if enemy.state == PlayerState::Punching {
             if let Some(entity) = enemy.animation_entity {
                if let Ok(anim) = animation_players.get(entity) {
                    if anim.all_finished() {
                        enemy.state = PlayerState::Idle;
                    }
                }
             }
        } else {
            if distance < attack_range {
                enemy.state = PlayerState::Punching;
            } else if distance < chase_range {
                enemy.state = PlayerState::Running;
            } else {
                enemy.state = PlayerState::Idle;
            }
        }

        // Logic
        match enemy.state {
            PlayerState::Running => {
                let mut direction = player_transform.translation - transform.translation;
                direction.y = 0.0;
                if direction.length_squared() > 0.0 {
                    direction = direction.normalize();
                    transform.translation += direction * enemy.speed * time.delta_seconds();
                    
                     let target_rotation = Quat::from_rotation_y(f32::atan2(direction.x, direction.z));
                     transform.rotation = transform.rotation.slerp(target_rotation, 10.0 * time.delta_seconds());
                }
            },
            _ => {}
        }

        // Animation
        if let Some(entity) = enemy.animation_entity {
            if let Ok(mut enemy_anim) = animation_players.get_mut(entity) {
                match enemy.state {
                    PlayerState::Running => {
                         if !enemy_anim.is_playing_animation(animations.run) {
                             enemy_anim.play(animations.run).repeat().set_speed(1.5);
                        }
                    }
                    PlayerState::Idle => {
                         if !enemy_anim.is_playing_animation(animations.idle) {
                             enemy_anim.play(animations.idle).repeat().set_speed(1.0);
                         }
                    }
                    PlayerState::Punching => {
                         if !enemy_anim.is_playing_animation(animations.punch) {
                             enemy_anim.play(animations.punch).set_speed(1.0);
                         } 
                    }
                    PlayerState::Jumping => {
                         if !enemy_anim.is_playing_animation(animations.idle) {
                             enemy_anim.play(animations.idle).repeat().set_speed(1.0);
                         }
                    }
                }
            }
        }
    }
}

fn player_movement(
    mut commands: Commands,
    keyboard_input: Res<ButtonInput<KeyCode>>,
    mobile_input: Res<MobileInput>,
    time: Res<Time>,
    mut query: Query<(&mut Transform, &mut Player)>, 
    mut animation_players: Query<&mut AnimationPlayer>,
    animations: Res<Animations>,
    audio_assets: Res<AudioAssets>,
) {
    for (mut transform, mut player) in &mut query {
        let mut direction = Vec3::ZERO;

        // Input handling (Keyboard)
        if keyboard_input.pressed(KeyCode::KeyW) { direction.z -= 1.0; }
        if keyboard_input.pressed(KeyCode::KeyS) { direction.z += 1.0; }
        if keyboard_input.pressed(KeyCode::KeyA) { direction.x -= 1.0; }
        if keyboard_input.pressed(KeyCode::KeyD) { direction.x += 1.0; }
        
        // Input handling (Mobile)
        if mobile_input.joystick_x != 0.0 || mobile_input.joystick_y != 0.0 {
             direction.x += mobile_input.joystick_x;
             direction.z += mobile_input.joystick_y;
        }

        let jump = keyboard_input.just_pressed(KeyCode::Space) || mobile_input.jump;
        let punch = keyboard_input.just_pressed(KeyCode::Enter) || mobile_input.punch;

        // State Machine & Physics Logic
        match player.state {
            PlayerState::Idle | PlayerState::Running => {
                let is_moving = direction.length_squared() > 0.0;
                
                if punch {
                   player.state = PlayerState::Punching;
                   // Play Punch Sound
                   commands.spawn(AudioBundle {
                       source: audio_assets.punch.clone(),
                       settings: PlaybackSettings::DESPAWN,
                   });
                } else if jump {
                   player.state = PlayerState::Jumping;
                } else if is_moving {
                   player.state = PlayerState::Running;
                } else {
                   player.state = PlayerState::Idle;
                }
            },
             PlayerState::Jumping => {
                 // in jump state
            },
            PlayerState::Punching => {
                // in punch state
            }
        }

        // Tank Controls / FPS Steering
        // Rotate (Yaw)
        let rotation_speed = 2.0;
        let rotation_input = -direction.x; // A/D or Joystick X
        if rotation_input.abs() > 0.0 {
             transform.rotate_y(rotation_input * rotation_speed * time.delta_seconds());
        }

        // Move (Forward/Back)
        if player.state != PlayerState::Punching {
             let move_input = -direction.z; // W/S or Joystick Y. direction.z is -1 for W.
             if move_input.abs() > 0.0 {
                 let forward = transform.forward();
                 transform.translation += forward * move_input * player.speed * time.delta_seconds();
                 // No need to set rotation based on movement direction for FPS
            }
        }

        // Animation Application
        if let Some(entity) = player.animation_entity {
            if let Ok(mut player_anim) = animation_players.get_mut(entity) {
                match player.state {
                    PlayerState::Running => {
                         if !player_anim.is_playing_animation(animations.run) {
                             player_anim.play(animations.run).repeat().set_speed(1.5);
                        }
                    }
                    PlayerState::Idle => {
                         if !player_anim.is_playing_animation(animations.idle) {
                             player_anim.play(animations.idle).repeat().set_speed(1.0);
                         }
                    }
                    PlayerState::Punching => {
                         if !player_anim.is_playing_animation(animations.punch) {
                             player_anim.play(animations.punch).set_speed(1.0);
                         } else if player_anim.all_finished() {
                             player.state = PlayerState::Idle;
                         }
                    }
                    PlayerState::Jumping => {
                        if !player_anim.is_playing_animation(animations.jump) {
                             player_anim.play(animations.jump).set_speed(1.0);
                        } else if player_anim.all_finished() {
                             player.state = PlayerState::Idle;
                         }
                    }
                }
            }
        }
    }
}

fn animate_fps_hands(
    time: Res<Time>,
    mut hand_query: Query<(&mut Transform, &FpsHand)>,
    player_query: Query<&Player>,
) {
    let player = if let Ok(p) = player_query.get_single() {
        p
    } else {
        return;
    };

    let elapsed = time.elapsed_seconds();

    for (mut transform, hand) in &mut hand_query {
        let mut target_pos = hand.original_position;

        match player.state {
             PlayerState::Running => {
                 // Bobbing
                 let bob_speed = 10.0;
                 let bob_amount = 0.05;
                 target_pos.y += (elapsed * bob_speed).sin() * bob_amount;
                 // Alternating
                 let offset = match hand.side {
                     HandSide::Left => 0.0,
                     HandSide::Right => std::f32::consts::PI,
                 };
                 target_pos.z += (elapsed * bob_speed + offset).sin() * 0.05;
             },
             PlayerState::Punching => {
                 // Simple Punch animation
                 // Ideally we'd use valid animation clips, but procedural is okay for placeholders
                 // Check which hand punches? For now, just RIGHT hand punches for simplicity
                 if matches!(hand.side, HandSide::Right) {
                      let punch_speed = 20.0;
                      target_pos.z -= (elapsed * punch_speed).sin().abs() * 0.3; // Move forward (negative Z)
                 }
             },
             _ => {
                 // Idle breathing
                 target_pos.y += (elapsed * 2.0).sin() * 0.01;
             }
        }

        // Smoothly interpolate (simple loop-based, not frame-perfect but simple)
        transform.translation = transform.translation.lerp(target_pos, 10.0 * time.delta_seconds());
    }
}
