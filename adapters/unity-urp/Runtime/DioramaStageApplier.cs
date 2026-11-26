using System;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace DioramaStageKit
{
    /// <summary>
    /// Enforces crisp pixel-art texture sampling (FilterMode.Point + anisoLevel = 0)
    /// on imported glTFast 2.5D diorama stages and applies lighting / URP Volume settings.
    /// Install via Unity Package Manager Git URL:
    /// https://github.com/tsubasa220325/diorama-stage-studio.git?path=adapters/unity-urp
    /// </summary>
    public class DioramaStageApplier : MonoBehaviour
    {
        [Header("Stage Visual Targets")]
        public Volume postProcessVolume;
        public Camera stageCamera;

        [Header("Post-Process Overrides (synced from stage.diorama.json)")]
        [Range(0f, 2f)] public float bloomStrength = 0.42f;
        [Range(0f, 1.5f)] public float dofStrength = 0.85f;
        public float focusDistance = 13.5f;
        [Range(0f, 1f)] public float vignetteIntensity = 0.45f;
        public Color fogColor = new Color(0.10f, 0.05f, 0.18f);
        public float fogDensity = 0.06f;

        public void ApplyPixelArtFiltering()
        {
            var renderers = GetComponentsInChildren<Renderer>(true);
            foreach (var rend in renderers)
            {
                foreach (var mat in rend.sharedMaterials)
                {
                    if (mat == null) continue;
                    foreach (var prop in mat.GetTexturePropertyNames())
                    {
                        if (mat.GetTexture(prop) is Texture2D tex)
                        {
                            tex.filterMode = FilterMode.Point;
                            tex.anisoLevel = 0;
                        }
                    }
                }
            }
        }

        public void ApplyAtmosphereAndPostProcess()
        {
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Exponential;
            RenderSettings.fogColor = fogColor;
            RenderSettings.fogDensity = fogDensity;

            if (postProcessVolume == null || postProcessVolume.profile == null) return;

            if (postProcessVolume.profile.TryGet<Bloom>(out var bloom))
            {
                bloom.active = true;
                bloom.intensity.Override(bloomStrength * 1.4f);
                bloom.threshold.Override(0.85f);
            }

            if (postProcessVolume.profile.TryGet<DepthOfField>(out var dof))
            {
                dof.active = dofStrength > 0.01f;
                dof.mode.Override(DepthOfFieldMode.Bokeh);
                dof.focusDistance.Override(focusDistance);
                dof.aperture.Override(Mathf.Lerp(16f, 2.8f, Mathf.Clamp01(dofStrength)));
            }

            if (postProcessVolume.profile.TryGet<Vignette>(out var vig))
            {
                vig.active = true;
                vig.intensity.Override(vignetteIntensity * 0.65f);
            }
        }

        private void Start()
        {
            ApplyPixelArtFiltering();
            ApplyAtmosphereAndPostProcess();
        }
    }
}
