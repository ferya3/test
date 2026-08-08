<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\HasTranslations;
use App\Support\Enums\MediaCollection;
use Database\Factories\MediaFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;

/**
 * @property string $disk
 * @property string $path
 * @property string $filename
 * @property string $mime_type
 * @property string $extension
 * @property int $size
 * @property int|null $width
 * @property int|null $height
 * @property array<string, array<int, string>>|null $conversions
 */
class Media extends Model
{
    /** @use HasFactory<MediaFactory> */
    use HasFactory;

    use HasTranslations;
    use SoftDeletes;

    protected $table = 'media';

    /**
     * @var list<string>
     */
    protected array $translatable = ['alt', 'title', 'caption'];

    protected $fillable = [
        'disk',
        'path',
        'filename',
        'mime_type',
        'extension',
        'size',
        'width',
        'height',
        'alt',
        'title',
        'caption',
        'collection',
        'conversions',
        'checksum',
        'uploaded_by',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'alt' => TranslatedJson::class,
            'title' => TranslatedJson::class,
            'caption' => TranslatedJson::class,
            'conversions' => 'array',
            'collection' => MediaCollection::class,
            'size' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
        ];
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function scopeInCollection(Builder $query, MediaCollection|string $collection): Builder
    {
        return $query->where('collection', $collection instanceof MediaCollection ? $collection->value : $collection);
    }

    public function scopeImages(Builder $query): Builder
    {
        return $query->where('mime_type', 'like', 'image/%');
    }

    public function scopeDocuments(Builder $query): Builder
    {
        return $query->where('mime_type', 'not like', 'image/%');
    }

    public function isImage(): bool
    {
        return str_starts_with($this->mime_type, 'image/');
    }

    public function isPdf(): bool
    {
        return $this->mime_type === 'application/pdf';
    }

    public function url(): string
    {
        return Storage::disk($this->disk)->url($this->path);
    }

    /**
     * Absolute URL for a generated derivative, e.g. url('webp', 960).
     */
    public function conversionUrl(string $format, int $width): ?string
    {
        $path = $this->conversions[$format][(string) $width] ?? null;

        return $path === null ? null : Storage::disk($this->disk)->url($path);
    }

    /**
     * The widths actually generated for a format, ascending.
     *
     * @return list<int>
     */
    public function conversionWidths(string $format): array
    {
        $widths = array_map('intval', array_keys($this->conversions[$format] ?? []));
        sort($widths);

        return $widths;
    }

    /**
     * A `srcset` string for one format, or null when no derivatives exist.
     */
    public function srcset(string $format): ?string
    {
        $entries = [];

        foreach ($this->conversionWidths($format) as $width) {
            $url = $this->conversionUrl($format, $width);

            if ($url !== null) {
                $entries[] = "{$url} {$width}w";
            }
        }

        return $entries === [] ? null : implode(', ', $entries);
    }

    /**
     * Intrinsic aspect ratio, used to reserve layout space and avoid CLS.
     */
    public function aspectRatio(): ?float
    {
        if ($this->width === null || $this->height === null || $this->height === 0) {
            return null;
        }

        return round($this->width / $this->height, 4);
    }

    public function humanSize(): string
    {
        $units = ['B', 'KB', 'MB', 'GB'];
        $size = (float) $this->size;
        $unit = 0;

        while ($size >= 1024 && $unit < count($units) - 1) {
            $size /= 1024;
            $unit++;
        }

        return round($size, $unit === 0 ? 0 : 1).' '.$units[$unit];
    }
}
