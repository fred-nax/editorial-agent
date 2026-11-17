<?php
/**
 * Plugin Name: Naxialis Yoast REST Meta
 * Description: Expose _yoast_wpseo_title et _yoast_wpseo_metadesc en écriture via l'API REST native WordPress (/wp/v2/posts). Requis par Naxialis Content Agent lorsque le plugin SEO sélectionné est Yoast SEO. L'API REST Yoast officielle reste en lecture seule.
 * Version: 1.0.0
 * Author: Naxialis
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 *
 * Installation (site de test uniquement avant production) :
 * 1. Copier ce dossier dans wp-content/plugins/naxialis-yoast-rest-meta/
 * 2. Activer Yoast SEO
 * 3. Activer « Naxialis Yoast REST Meta »
 * 4. Créer un brouillon via Naxialis (Paramètres → Yoast SEO)
 * 5. Vérifier titre SEO + meta description dans l'éditeur Yoast du brouillon
 *
 * Sécurité :
 * - show_in_rest + auth_callback = current_user_can('edit_post', $post_id)
 * - Application Passwords respectés (utilisateur authentifié)
 * - Aucune route publique dédiée
 * - N'autorise pas la publication automatique
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Enregistre les post meta Yoast nécessaires pour l'écriture REST.
 */
function naxialis_yoast_rest_meta_register(): void
{
    $keys = array(
        '_yoast_wpseo_title',
        '_yoast_wpseo_metadesc',
    );

    foreach ($keys as $key) {
        register_post_meta(
            'post',
            $key,
            array(
                'type'              => 'string',
                'single'            => true,
                'show_in_rest'      => true,
                'auth_callback'     => static function ($allowed, $meta_key, $post_id) {
                    unset($allowed, $meta_key);
                    $post_id = (int) $post_id;
                    if ($post_id <= 0) {
                        return false;
                    }
                    return current_user_can('edit_post', $post_id);
                },
                'sanitize_callback' => 'sanitize_text_field',
            )
        );
    }
}
add_action('init', 'naxialis_yoast_rest_meta_register');
