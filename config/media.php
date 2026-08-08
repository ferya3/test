<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Disks
    |--------------------------------------------------------------------------
    |
    | Images are served straight off disk by Nginx, so they live on a public
    | disk. Documents are gated behind the catalogue lead form and are streamed
    | through a controller, so they live on a private disk with no public URL —
    | otherwise the download route would be trivially bypassed by guessing the
    | storage path.
    |
    */

    'image_disk' => env('MEDIA_IMAGE_DISK', 'media'),
    'document_disk' => env('MEDIA_DOCUMENT_DISK', 'documents'),

    /*
    |--------------------------------------------------------------------------
    | Accepted uploads
    |--------------------------------------------------------------------------
    |
    | The MIME type is detected from the file's own contents, never taken from
    | the client, and the extension is derived from that detected type rather
    | than from the uploaded filename. Anything not listed here is rejected.
    |
    | SVG is deliberately absent: it is an XML document that can carry script
    | and external references, so accepting it from an admin upload form would
    | be a stored-XSS vector. Raster formats only.
    |
    */

    'accepted' => [
        'image/jpeg' => ['extension' => 'jpg', 'kind' => 'image'],
        'image/png' => ['extension' => 'png', 'kind' => 'image'],
        'image/webp' => ['extension' => 'webp', 'kind' => 'image'],
        'image/avif' => ['extension' => 'avif', 'kind' => 'image'],
        'application/pdf' => ['extension' => 'pdf', 'kind' => 'document'],
    ],

    /*
    | Extensions that must never be stored, whatever the detected type says.
    | A defence in depth against a crafted file that sniffs as an image but is
    | named to be executed by a misconfigured web server.
    */

    'forbidden_extensions' => [
        'php', 'phtml', 'php3', 'php4', 'php5', 'php7', 'php8', 'phps', 'pht',
        'phar', 'inc', 'cgi', 'pl', 'py', 'rb', 'sh', 'bash', 'exe', 'com',
        'bat', 'cmd', 'jar', 'js', 'mjs', 'html', 'htm', 'xhtml', 'svg', 'xml',
        'htaccess',
    ],

    'max_size' => [
        'image' => env('MEDIA_MAX_IMAGE_KB', 8 * 1024),
        'document' => env('MEDIA_MAX_DOCUMENT_KB', 24 * 1024),
    ],

    /*
    |--------------------------------------------------------------------------
    | Decoded pixel budget
    |--------------------------------------------------------------------------
    |
    | max_size above measures *compressed* bytes, which says nothing about what
    | a file costs to decode: a 65-byte PNG can legally declare 30000x30000 and
    | ask GD for ~3.4 GB of memory. That is a decompression bomb, and the byte
    | cap cannot see it.
    |
    | So dimensions are read from the file header (no allocation) and checked
    | against this budget before anything is decoded. GD holds roughly 4 bytes
    | per pixel for a truecolor image, so 50 MP is about 200 MB peak — generous
    | beside any real camera upload, and well inside a normal memory_limit.
    |
    */

    'max_megapixels' => env('MEDIA_MAX_MEGAPIXELS', 50),

    /*
    |--------------------------------------------------------------------------
    | Conversions
    |--------------------------------------------------------------------------
    |
    | Responsive widths generated for every uploaded image. A derivative is only
    | produced when it would actually be smaller than the original, so a 900px
    | source does not get upscaled into a 1920px "variant" that is larger and
    | blurrier than what it came from.
    |
    | AVIF first, WebP second, original last — the picture component emits them
    | in that order and the browser takes the first it understands.
    |
    */

    'widths' => [320, 640, 960, 1280, 1920, 2560],

    'formats' => [
        'avif' => ['quality' => 55],
        'webp' => ['quality' => 78],
    ],

    /*
    | Largest dimension the stored original is reduced to. Editors upload
    | straight off a camera; keeping a 6000px master costs disk and conversion
    | time for a page that never renders wider than 2560.
    */

    'max_original_width' => 3000,

    /*
    | Conversions run on the queue. Set to true only for tests and for the
    | placeholder generator, where waiting is the point.
    */

    'process_synchronously' => env('MEDIA_SYNC_CONVERSIONS', false),

];
