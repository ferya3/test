<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Enums\LeadStatus;
use Database\Factories\CatalogRequestFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A gated catalogue download request.
 *
 * @property LeadStatus $status
 */
class CatalogRequest extends Model
{
    /** @use HasFactory<CatalogRequestFactory> */
    use HasFactory;

    protected $fillable = [
        'catalog_id',
        'name',
        'company',
        'phone',
        'email',
        'city',
        'message',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => LeadStatus::class,
            'handled_at' => 'datetime',
        ];
    }

    public function catalog(): BelongsTo
    {
        return $this->belongsTo(Catalog::class);
    }

    public function handler(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handled_by');
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNot('status', LeadStatus::Closed);
    }

    public function scopeLatestFirst(Builder $query): Builder
    {
        return $query->orderByDesc('created_at');
    }

    public function markHandledBy(User $user, LeadStatus $status): void
    {
        $this->forceFill([
            'status' => $status,
            'handled_by' => $user->getKey(),
            'handled_at' => now(),
        ])->save();
    }
}
