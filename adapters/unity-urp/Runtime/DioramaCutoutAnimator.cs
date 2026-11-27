using UnityEngine;

namespace DioramaStageKit
{
    public enum CutoutBeatMotion
    {
        None,
        Pendulum,
        Sway,
        Bob,
    }

    /// <summary>
    /// Animates 2.5D alpha-cutout stage props (geometry.cutouts[] from Diorama Stage Studio v0.7.0)
    /// around their configured UV pivot in sync with musical beats while preserving cast shadows.
    /// </summary>
    public class DioramaCutoutAnimator : MonoBehaviour
    {
        public CutoutBeatMotion beatAnim = CutoutBeatMotion.None;
        public float swingAmpRadians = 0.36f;
        public float phaseRadians = 0f;
        public float bobAmplitude = 0.13f;
        public bool castShadow = true;

        private Vector3 _baseLocalPos;
        private Quaternion _baseLocalRot;
        private bool _initialized;

        private void EnsureInit()
        {
            if (_initialized) return;
            _baseLocalPos = transform.localPosition;
            _baseLocalRot = transform.localRotation;
            _initialized = true;
            var rend = GetComponent<Renderer>();
            if (rend != null)
            {
                rend.shadowCastingMode = castShadow
                    ? UnityEngine.Rendering.ShadowCastingMode.On
                    : UnityEngine.Rendering.ShadowCastingMode.Off;
            }
        }

        public void ApplyBeat(float beats)
        {
            EnsureInit();
            float rotRad = 0f;
            float offsetY = 0f;

            switch (beatAnim)
            {
                case CutoutBeatMotion.Pendulum:
                    rotRad = Mathf.Cos(beats * Mathf.PI + phaseRadians) * swingAmpRadians;
                    break;
                case CutoutBeatMotion.Sway:
                    rotRad = Mathf.Sin(beats * Mathf.PI + phaseRadians) * swingAmpRadians;
                    break;
                case CutoutBeatMotion.Bob:
                    offsetY = Mathf.Sin(beats * Mathf.PI * 0.5f + phaseRadians) * bobAmplitude;
                    break;
            }

            transform.localPosition = _baseLocalPos + new Vector3(0f, offsetY, 0f);
            transform.localRotation = _baseLocalRot * Quaternion.Euler(0f, 0f, rotRad * Mathf.Rad2Deg);
        }
    }
}
