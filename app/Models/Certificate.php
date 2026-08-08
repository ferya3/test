<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\GeneratesSlug;
use App\Models\Concerns\HasSeoMetadata;
use App\Models\Concerns\HasTranslations;
use App\Models\Concerns\Orderable;
use Database\Factories\CertificateFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property Carbon|null $expires_at
 */
class Certificate extends Model
{
    use GeneratesSlug;

    /** @use HasFactory<CertificateFactory> */
    use HasFactory;
    use HasSeoMetadata;
    use HasTranslations;
    use Orderable;

    /**
     * @var list<string>
     */
    protected array $translatable = ['title', 'issuer', 'description'];

    protected $fillable = [
        'slug',
        'title',
        'issuer',
        'description',
        'certificate_number',
        'issued_at',
        'expires_at',
        'media_id',
        'document_media_id',
        'is_active',
        'position',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'title' => TranslatedJson::class,
            'issuer' => TranslatedJson::class,
            'description' => TranslatedJson::class,
            'issued_at' => 'date',
            'expires_at' => 'date',
            'is_active' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function image(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'media_id');
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'document_media_id');
    }

    /**
     * Certificates with no expiry never lapse.
     */
    public function scopeValid(Builder $query): Builder
    {
        return $query->where(function (Builder $query): void {
            $query->whereNull('expires_at')->orWhere('expires_at', '>=', now()->toDateString());
        });
    }

    public function hasExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    protected function slugSourceAttribute(): string
    {
        return 'title';
    }

    protected function slugFallback(): string
    {
        return 'certificate';
    }
}
