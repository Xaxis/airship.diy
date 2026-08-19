'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import { WebGLUnavailable } from './HullViewer'
import { buildShip, type ShipMode } from './three/ship'
import { shipGeometries } from '../lib/model'

/**
 * The vehicle changing configuration, at the model's own dimensions.
 *
 * WHY THIS EXISTS. This project's whole claim is a buoyant ship that lands on
 * water and works as a boat, and the design carries four things a conventional
 * airship does not: vectoring propulsors, outboard wings, a retractable
 * centreboard and a seawater ballast loop. None of that was visible anywhere.
 * Every three-dimensional view drew one fixed 118 m vehicle in cruise, with a
 * moulded tail, no wings, no board, and propulsors that could not tilt, so the
 * reader had to take the interesting half of the design on faith.
 *
 * It also drew the SAME vehicle for every design point, which hid the thing a
 * reader most wants to see: the minimum-viable point is 65 m and does not
 * close, and the stretch is 125 m.
 *
 * Every dimension, station, tilt limit and the waterline itself comes from
 * `shipGeometries`, which is computed by the same functions the mass statement
 * and the stability gates use. Nothing here chooses a number.
 */

const MODES: { id: ShipMode; label: string; blurb: string }[] = [
  {
    id: 'cruise',
    label: 'Cruise',
    blurb:
      'Propulsors horizontal, board retracted into its trunk. The configuration the vehicle spends almost all of its life in, holding station against the wind.',
  },
  {
    id: 'hover',
    label: 'Vectored',
    blurb:
      'Propulsors tilted to lift. The mid pair reaches vertical and the aft pair only sixty degrees, because that is what the arrangement gives them. This is what removes the ground crew: a conventional rigid needed eighteen people and two mechanical mules to land.',
  },
  {
    id: 'afloat',
    label: 'Afloat',
    blurb:
      'On the water. The centreboard is down and it is now the deepest thing on the vehicle by a factor of a hundred, because a buoyant ship rests on its residual heaviness rather than its weight.',
  },
]

export function ConfigurationViewer() {
  const mount = useRef<HTMLDivElement>(null)
  const [unsupported, setUnsupported] = useState(false)
  const [designId, setDesignId] = useState(shipGeometries[0]?.id ?? 'baseline')
  const [mode, setMode] = useState<ShipMode>('cruise')

  const geometry = useMemo(
    () => shipGeometries.find((g) => g.id === designId) ?? shipGeometries[0]!,
    [designId],
  )

  useEffect(() => {
    const container = mount.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0c0f)

    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, geometry.length * 20)
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      setUnsupported(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const built = buildShip({ geometry, mode, wireframe: true, hullSegments: 72 })
    const root = new THREE.Group()
    root.add(built.group)
    scene.add(root)

    // The sea, only when the vehicle is on it. Placed at the waterline the
    // flotation state computes rather than at a height that looks right.
    let water: THREE.Mesh | null = null
    if (mode === 'afloat') {
      const geom = new THREE.PlaneGeometry(geometry.length * 6, geometry.length * 6, 60, 60)
      geom.rotateX(-Math.PI / 2)
      const mat = new THREE.MeshStandardMaterial({
        color: 0x123a4d,
        transparent: true,
        opacity: 0.85,
        roughness: 0.4,
        metalness: 0.1,
      })
      water = new THREE.Mesh(geom, mat)
      water.position.y = -built.waterlineOffset
      scene.add(water)
    }

    scene.add(new THREE.AmbientLight(0x9aa7b4, 1.15))
    const key = new THREE.DirectionalLight(0xffffff, 1.5)
    key.position.set(1, 1.3, 0.8)
    scene.add(key)
    // A side fill, because the key is nearly overhead and the cruciform's
    // vertical surfaces face sideways; without it the tail renders as a slab.
    const fill = new THREE.DirectionalLight(0x8fb4dd, 0.55)
    fill.position.set(-0.7, 0.15, -1)
    scene.add(fill)

    let angle = 0.6
    let dragging = false
    let lastX = 0
    const down = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      container.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      angle += (e.clientX - lastX) * 0.006
      lastX = e.clientX
    }
    const up = () => {
      dragging = false
    }
    container.addEventListener('pointerdown', down)
    container.addEventListener('pointermove', move)
    container.addEventListener('pointerup', up)
    container.addEventListener('pointercancel', up)

    const resize = () => {
      const width = container.clientWidth
      const height = Math.max(Math.round(width * 0.5), 300)
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    let frame = 0
    const render = () => {
      if (!dragging) angle += 0.0016
      const distance = geometry.length * 1.55
      camera.position.set(
        Math.cos(angle) * distance,
        geometry.maxRadius * 1.4,
        Math.sin(angle) * distance,
      )
      camera.lookAt(0, 0, 0)
      renderer.render(scene, camera)
      frame = requestAnimationFrame(render)
    }
    render()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      container.removeEventListener('pointerdown', down)
      container.removeEventListener('pointermove', move)
      container.removeEventListener('pointerup', up)
      container.removeEventListener('pointercancel', up)
      built.dispose()
      water?.geometry.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [geometry, mode])

  if (unsupported) return <WebGLUnavailable what="configuration view" />

  const active = MODES.find((m) => m.id === mode)
  const board = geometry.centreboard
  const draftCm = geometry.flotation.draft * 100

  return (
    <figure className="border border-[var(--color-rule)] bg-[var(--color-panel)]">
      <div className="flex flex-wrap gap-2 border-b border-[var(--color-rule)] p-3">
        {shipGeometries.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setDesignId(g.id)}
            className={`px-3 py-1.5 text-xs ${
              g.id === designId
                ? 'bg-[var(--color-accent)] text-[#0b0e12]'
                : 'border border-[var(--color-rule)] bg-[var(--color-bg)] text-[var(--color-ink)]'
            }`}
          >
            {g.name} · {g.length} m{g.closes ? '' : ' · does not close'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[var(--color-rule)] p-3">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`px-3 py-1.5 text-xs ${
              m.id === mode
                ? 'bg-[var(--color-accent)] text-[#0b0e12]'
                : 'border border-[var(--color-rule)] bg-[var(--color-bg)] text-[var(--color-ink)]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div ref={mount} className="w-full cursor-grab" aria-label="Vehicle configuration" />

      <figcaption className="border-t border-[var(--color-rule)] p-4 text-sm leading-relaxed text-[var(--color-ink-dim)]">
        <p>{active?.blurb}</p>
        {mode === 'afloat' && (
          <p className="mt-3">
            It floats {draftCm.toFixed(1)} cm deep on {geometry.flotation.waterplaneArea.toFixed(0)}{' '}
            m&sup2; of waterplane, carrying only the{' '}
            {geometry.flotation.waterborneLoad.toFixed(0)} kg of residual heaviness it lands with.
            The centreboard reaches {board.span.toFixed(1)} m below the keel, which is{' '}
            {(board.span / geometry.flotation.draft).toFixed(0)} times the draft. That ratio is the
            whole argument: flotation is trivial and lateral resistance is not, because a hull this
            size with no grip on the water goes wherever the wind sends it.
          </p>
        )}
      </figcaption>
    </figure>
  )
}
