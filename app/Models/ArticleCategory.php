<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\TranslatedJson;
use App\Models\Concerns\GeneratesSlug;
use App\Models\Concerns\HasSeoMetadata;
use App\Models\Concerns\HasTranslations;
use App\Models\Concerns\Orderable;
use Database\Factories\ArticleCategoryFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ArticleCategory extends Model
{
    use GeneratesSlug;

    /** @use HasFactory<ArticleCategoryFactory> */
    use HasFactory;
    use HasSeoMetadata;
    use HasTranslations;
    use Orderable;

    /**
     * @var list<string>
     */
    protected array $translatable = ['name', 'description'];

    protected $fillable = [
        'slug',
        'name',
        'description',
        'position',
        'is_active',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'name' => TranslatedJson::class,
            'description' => TranslatedJson::class,
            'is_active' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function articles(): HasMany
    {
        return $this->hasMany(Article::class);
    }

    protected function slugFallback(): string
    {
        return 'topic';
    }
}
