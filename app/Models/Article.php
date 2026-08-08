<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\GeneratesSlug;
use App\Models\Concerns\HasSeoMetadata;
use App\Models\Concerns\HasTranslations;
use App\Support\Enums\ArticleStatus;
use Database\Factories\ArticleFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * @property ArticleStatus $status
 * @property Carbon|null $published_at
 */
class Article extends Model
{
    use GeneratesSlug;

    /** @use HasFactory<ArticleFactory> */
    use HasFactory;
    use HasSeoMetadata;
    use HasTranslations;
    use SoftDeletes;

    /**
     * @var list<string>
     */
    protected array $translatable = ['title', 'excerpt', 'body'];

    protected $fillable = [
        'article_category_id',
        'slug',
        'title',
        'excerpt',
        'body',
        'cover_media_id',
        'author_id',
        'reading_time',
        'status',
        'published_at',
        'is_featured',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'title' => TranslatedJson::class,
            'excerpt' => TranslatedJson::class,
            'body' => TranslatedJson::class,
            'status' => ArticleStatus::class,
            'published_at' => 'datetime',
            'is_featured' => 'boolean',
            'reading_time' => 'integer',
            'view_count' => 'integer',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ArticleCategory::class, 'article_category_id');
    }

    public function cover(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'cover_media_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('articles.status', ArticleStatus::Published)
            ->where(function (Builder $query): void {
                $query->whereNull('articles.published_at')
                    ->orWhere('articles.published_at', '<=', now());
            });
    }

    public function scopeFeatured(Builder $query): Builder
    {
        return $query->where('articles.is_featured', true);
    }

    public function scopeLatestFirst(Builder $query): Builder
    {
        return $query->orderByDesc('articles.published_at')->orderByDesc('articles.id');
    }

    public function isPublished(): bool
    {
        return $this->status === ArticleStatus::Published
            && ($this->published_at === null || $this->published_at->isPast());
    }

    protected function slugSourceAttribute(): string
    {
        return 'title';
    }

    protected function slugFallback(): string
    {
        return 'article';
    }
}
