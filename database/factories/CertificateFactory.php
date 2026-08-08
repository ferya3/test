<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Certificate;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Certificate>
 */
class CertificateFactory extends Factory
{
    use MakesTranslations;

    protected $model = Certificate::class;

    /**
     * @var list<array{0: string, 1: string, 2: string, 3: string}>
     */
    private const array CERTIFICATES = [
        ['ایزو ۹۰۰۱', 'ISO 9001', 'سازمان استاندارد', 'International Organization for Standardization'],
        ['ایزو ۱۴۰۰۱', 'ISO 14001', 'سازمان استاندارد', 'International Organization for Standardization'],
        ['گواهی E1', 'E1 Emission Certificate', 'آزمایشگاه مرجع', 'Reference Laboratory'],
        ['استاندارد ملی ایران', 'Iranian National Standard', 'سازمان ملی استاندارد', 'INSO'],
    ];

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        [$titleFa, $titleEn, $issuerFa, $issuerEn] = self::CERTIFICATES[array_rand(self::CERTIFICATES)];
        $index = fake()->unique()->numberBetween(1, 99999);
        $issuedAt = fake()->dateTimeBetween('-5 years', '-2 months');

        return [
            'title' => $this->bilingual("{$titleFa} {$index}", "{$titleEn} {$index}"),
            'issuer' => $this->bilingual($issuerFa, $issuerEn),
            'description' => $this->bilingual($this->faParagraph(2), fake()->sentence()),
            'certificate_number' => 'CERT-'.$index,
            'issued_at' => $issuedAt,
            'expires_at' => fake()->dateTimeBetween('+6 months', '+4 years'),
            'media_id' => null,
            'document_media_id' => null,
            'is_active' => true,
            'position' => fake()->numberBetween(0, 30),
        ];
    }

    public function expired(): static
    {
        return $this->state(fn (array $attributes): array => [
            'expires_at' => now()->subMonth(),
        ]);
    }

    public function neverExpires(): static
    {
        return $this->state(fn (array $attributes): array => [
            'expires_at' => null,
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes): array => [
            'is_active' => false,
        ]);
    }
}
