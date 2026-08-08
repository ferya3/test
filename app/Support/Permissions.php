<?php

declare(strict_types=1);

namespace App\Support;

use App\Support\Enums\RoleName;

/**
 * The permission matrix, in one place.
 *
 * Permissions are named `{resource}.{ability}` and are generated from this map
 * rather than typed out by hand, so adding a resource cannot leave the seeder,
 * the policies and the admin navigation out of sync.
 */
final class Permissions
{
    public const string VIEW_ANY = 'viewAny';

    public const string VIEW = 'view';

    public const string CREATE = 'create';

    public const string UPDATE = 'update';

    public const string DELETE = 'delete';

    /**
     * Standard CRUD abilities.
     *
     * @var list<string>
     */
    public const array CRUD = [
        self::VIEW_ANY,
        self::VIEW,
        self::CREATE,
        self::UPDATE,
        self::DELETE,
    ];

    /**
     * Resources that only ever get read + triage (leads are never authored).
     *
     * @var list<string>
     */
    public const array TRIAGE = [
        self::VIEW_ANY,
        self::VIEW,
        self::UPDATE,
        self::DELETE,
    ];

    /**
     * resource => abilities
     *
     * @return array<string, list<string>>
     */
    public static function matrix(): array
    {
        return [
            // Catalogue
            'products' => self::CRUD,
            'categories' => self::CRUD,
            'colors' => self::CRUD,
            'decors' => self::CRUD,
            'materials' => self::CRUD,
            'surfaces' => self::CRUD,
            'applications' => self::CRUD,
            'thicknesses' => self::CRUD,

            // Content
            'articles' => self::CRUD,
            'article-categories' => self::CRUD,
            'pages' => self::CRUD,
            'projects' => self::CRUD,
            'certificates' => self::CRUD,
            'catalogs' => self::CRUD,
            'representatives' => self::CRUD,

            // Assets
            'media' => self::CRUD,

            // Leads
            'contact-requests' => self::TRIAGE,
            'catalog-requests' => self::TRIAGE,

            // Administration
            'seo' => [self::VIEW_ANY, self::UPDATE],
            'users' => self::CRUD,
            'roles' => self::CRUD,
            'settings' => [self::VIEW_ANY, self::UPDATE],
        ];
    }

    /**
     * Every permission name, flattened.
     *
     * @return list<string>
     */
    public static function all(): array
    {
        $names = [];

        foreach (self::matrix() as $resource => $abilities) {
            foreach ($abilities as $ability) {
                $names[] = self::name($resource, $ability);
            }
        }

        return $names;
    }

    public static function name(string $resource, string $ability): string
    {
        return "{$resource}.{$ability}";
    }

    /**
     * Permissions granted to each role. Super Admin is deliberately absent —
     * it is short-circuited by a Gate::before rule instead of being granted
     * every permission individually, so new resources are covered automatically.
     *
     * @return array<string, list<string>>
     */
    public static function forRoles(): array
    {
        return [
            RoleName::Admin->value => self::except(['roles', 'users']),

            RoleName::Editor->value => self::for([
                'articles' => self::CRUD,
                'article-categories' => self::CRUD,
                'pages' => self::CRUD,
                'projects' => self::CRUD,
                'certificates' => self::CRUD,
                'catalogs' => self::CRUD,
                'representatives' => self::CRUD,
                'media' => self::CRUD,
                'seo' => [self::VIEW_ANY, self::UPDATE],
                'contact-requests' => [self::VIEW_ANY, self::VIEW],
                'catalog-requests' => [self::VIEW_ANY, self::VIEW],
            ]),

            RoleName::ProductManager->value => self::for([
                'products' => self::CRUD,
                'categories' => self::CRUD,
                'colors' => self::CRUD,
                'decors' => self::CRUD,
                'materials' => self::CRUD,
                'surfaces' => self::CRUD,
                'applications' => self::CRUD,
                'thicknesses' => self::CRUD,
                'media' => self::CRUD,
                'seo' => [self::VIEW_ANY, self::UPDATE],
                'contact-requests' => self::TRIAGE,
                'catalog-requests' => self::TRIAGE,
            ]),
        ];
    }

    /**
     * @param  array<string, list<string>>  $map
     * @return list<string>
     */
    private static function for(array $map): array
    {
        $names = [];

        foreach ($map as $resource => $abilities) {
            foreach ($abilities as $ability) {
                $names[] = self::name($resource, $ability);
            }
        }

        return $names;
    }

    /**
     * @param  list<string>  $resources
     * @return list<string>
     */
    private static function except(array $resources): array
    {
        return self::for(array_diff_key(self::matrix(), array_flip($resources)));
    }
}
