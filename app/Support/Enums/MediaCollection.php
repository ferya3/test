<?php

declare(strict_types=1);

namespace App\Support\Enums;

enum MediaCollection: string implements HasLabel
{
    case Products = 'products';
    case Categories = 'categories';
    case Colors = 'colors';
    case Decors = 'decors';
    case Projects = 'projects';
    case Articles = 'articles';
    case Certificates = 'certificates';
    case Catalogs = 'catalogs';
    case Pages = 'pages';
    case Documents = 'documents';
    case General = 'general';

    public function label(): string
    {
        return __("enums.media_collection.{$this->value}");
    }

    /**
     * Collections that hold documents (PDFs) rather than images, and so skip
     * the raster conversion pipeline.
     */
    public function isDocumentCollection(): bool
    {
        return $this === self::Documents;
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
